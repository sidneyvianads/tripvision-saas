// /api/webhook-mp — recebe notificações do Mercado Pago.
// Atualiza users.plano + assinaturas com base no status do preapproval.
// Quando MERCADOPAGO_ACCESS_TOKEN não está configurado, apenas loga e
// retorna 200 pra MP não ficar reentregando.
//
// SEGURANÇA:
// 1) HMAC validation via x-signature (modo permissivo: sem MP_WEBHOOK_SECRET
//    apenas loga warning, com secret valida e recusa request inválido).
//    Doc: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks#bookmark_validar_o_origen_de_la_notificación
// 2) Cross-check payer_email do MP vs users.email pelo user_id do
//    external_reference (impede forjar external_reference de outro user
//    e ganhar plano grátis).
//
// Trial de 7 dias: quando o preapproval é autorizado, o usuário entra em
// trial. trial_ends_at = NOW + 7d. plano_expires_at = trial_ends_at + ciclo
// (dá acesso ao trial + o primeiro ciclo de uma vez, evita ficar dependente
// do webhook de cada renovação).

import { createHmac, timingSafeEqual } from "node:crypto";
import { captureException, captureMessage } from "./_lib/sentry.mjs";
import { trackPaymentCompleted } from "./_lib/analytics.mjs";
import { withRetry } from "./_lib/retry.mjs";

const TRIAL_DAYS = 7;

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

async function sb(path, init = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env vars ausentes.");
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  return await withRetry(async () => {
    const res = await fetch(url, {
      ...init,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      console.error("[webhook-mp] supabase error:", res.status, text);
      throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    }
    return json;
  }, "supabase", 2, 500);
}

// Valida x-signature do MP. Manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// Compara HMAC-SHA256(manifest, secret) com v1 do header x-signature.
//
// Retornos:
//   { ok: true, mode: "validated" }  — secret OK e assinatura confere
//   { ok: true, mode: "permissive" } — sem secret configurado (warning logado)
//   { ok: false, reason: "..." }     — secret configurado e assinatura inválida
//
// Exportado pra cobertura de testes (tests/hmac.test.mjs).
export function validateMpSignature(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[webhook-mp] ⚠️  MP_WEBHOOK_SECRET não configurado — request aceito sem validar HMAC. " +
      "Configure no painel do MP (Webhooks → Secret) e seta MP_WEBHOOK_SECRET no Netlify."
    );
    return { ok: true, mode: "permissive" };
  }
  const sigHeader = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  if (!sigHeader) return { ok: false, reason: "x-signature ausente" };

  // Parse "ts=...,v1=..."
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, reason: "x-signature mal formado" };

  const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  // timingSafeEqual exige buffers do mesmo tamanho
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return { ok: false, reason: "v1 com tamanho inválido" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "HMAC não confere" };
  return { ok: true, mode: "validated" };
}

function planoFromExternalRef(ref) {
  // formato: "userId:plano:ciclo[:afiliadoId[:descPct]]"
  const parts = (ref ?? "").split(":");
  return {
    user_id: parts[0],
    plano: parts[1],
    ciclo: parts[2],
    afiliado_id: parts[3] || null,
    desconto_percent: parts[4] ? Number(parts[4]) : 0,
  };
}

function mesReferencia(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function fetchPreapproval(id) {
  return await withRetry(async () => {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`MP preapproval fetch ${res.status}: ${t.slice(0, 200)}`);
    }
    return res.json();
  }, "mp-preapproval", 2, 500);
}

// Retorna a maior data ISO entre duas (ou a única não-null). Evita que
// webhook reentregue encurte plano_expires_at de quem já estava com data
// estendida (R6-2 cron faz extensão proativa).
function maxIsoDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() > new Date(b).getTime() ? a : b;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addCiclo(date, ciclo) {
  const d = new Date(date);
  if (ciclo === "anual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// Janela de acesso = trial (7d) + ciclo. Dá acesso completo desde a confirmação
// até o fim do primeiro ciclo. Webhooks subsequentes vão estender daqui.
function accessWindowEnd(ciclo) {
  const now = new Date();
  const afterTrial = addDays(now, TRIAL_DAYS);
  return addCiclo(afterTrial, ciclo);
}

async function handlePreapproval(id) {
  const pa = await fetchPreapproval(id);
  const { user_id, plano, ciclo, afiliado_id } = planoFromExternalRef(pa.external_reference);
  if (!user_id) {
    console.warn("[webhook-mp] external_reference inválido:", pa.external_reference);
    return;
  }

  // Cross-check: o payer_email retornado pelo MP precisa bater com o email
  // do user_id no external_reference. Impede ataque de forjar external_reference
  // ("user_id de outra pessoa") pra ganhar plano sem pagar.
  //
  // IMPORTANTE: erros transitórios (Supabase 5xx, network blip) re-throw pro
  // catch externo — handler retorna 500 → MP reentrega o webhook. Antes:
  // return silencioso → 200 OK → MP nunca reentregava → ativação perdida
  // pra sempre. Só mismatch real (user inexistente / email diferente)
  // recusa definitivamente com return.
  const payerEmail = (pa.payer_email ?? "").trim().toLowerCase();
  if (payerEmail) {
    const userRows = await sb(
      `users?id=eq.${user_id}&select=id,email`,
      { method: "GET", headers: { Prefer: "" } }
    );
    const userRow = Array.isArray(userRows) ? userRows[0] : null;
    if (!userRow) {
      console.error(`[webhook-mp] 🚨 user_id ${user_id} não existe — recusando ativação`);
      captureMessage("webhook-mp: user_id não existe", "warning", { user_id, preapproval: id });
      return;
    }
    const userEmail = (userRow.email ?? "").trim().toLowerCase();
    if (userEmail !== payerEmail) {
      console.error(
        `[webhook-mp] 🚨 payer_email mismatch — user_id=${user_id} email=${userEmail} ` +
        `payer=${payerEmail} preapproval=${id} — recusando ativação (possível tampering em external_reference)`
      );
      captureMessage("webhook-mp: payer_email mismatch", "warning", {
        user_id, userEmail, payerEmail, preapproval: id,
      });
      return;
    }
  } else {
    console.warn(`[webhook-mp] preapproval ${id} sem payer_email — pulando cross-check`);
  }

  const status = pa.status; // pending, authorized, paused, cancelled
  const isActive = status === "authorized";
  const isCanceled = status === "cancelled" || status === "paused";
  const amount = pa.auto_recurring?.transaction_amount ?? null;

  const now = new Date();
  const trialEnd = addDays(now, TRIAL_DAYS);
  const accessEnd = accessWindowEnd(ciclo);

  // 1) UPSERT em assinaturas
  const subPayload = {
    user_id,
    plano,
    ciclo,
    status: isActive ? "active" : (isCanceled ? "canceled" : "pending"),
    provider: "mercadopago",
    mp_preapproval_id: id,
    amount,
    current_period_start: now.toISOString(),
    current_period_end: isActive ? accessEnd.toISOString() : null,
    updated_at: now.toISOString(),
    afiliado_id: afiliado_id || null,
    cupom_usado: null,
  };
  const subRows = await sb(`assinaturas?on_conflict=mp_preapproval_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(subPayload),
  });
  const assinaturaId = Array.isArray(subRows) ? subRows[0]?.id : subRows?.id;

  // 2) Comissão de afiliado (apenas quando ativa pela primeira vez)
  if (isActive && afiliado_id && amount && assinaturaId) {
    try {
      const afiliados = await sb(
        `afiliados?id=eq.${afiliado_id}&select=id,nome,comissao_percent,total_indicados,total_receita`,
        { method: "GET", headers: { Prefer: "" } }
      );
      const af = Array.isArray(afiliados) ? afiliados[0] : null;
      if (af) {
        const pct = Number(af.comissao_percent ?? 5);
        const valorComissao = Math.round(amount * pct) / 100;
        const mes = mesReferencia();
        // INSERT idempotente via UNIQUE (afiliado_id, assinatura_id, mes_referencia).
        // Antes era SELECT-then-INSERT — não-atômico, race entre webhooks
        // simultâneos do MP gerava comissão duplicada paga. Agora se já existe
        // pra esse trio, ON CONFLICT DO NOTHING garante 0 efeito + retorna [].
        // Prefer: resolution=ignore-duplicates é a sintaxe do PostgREST.
        const userRowsForSnap = await sb(
          `users?id=eq.${user_id}&select=email`,
          { method: "GET", headers: { Prefer: "" } }
        );
        const userEmailSnap = Array.isArray(userRowsForSnap) ? userRowsForSnap[0]?.email : null;
        const inserted = await sb(`comissoes?on_conflict=afiliado_id,assinatura_id,mes_referencia`, {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({
            afiliado_id,
            assinatura_id: assinaturaId,
            valor_assinatura: amount,
            percentual: pct,
            valor_comissao: valorComissao,
            mes_referencia: mes,
            status: "pendente",
            user_email_snapshot: userEmailSnap ?? null,
            plano_snapshot: plano,
            ciclo_snapshot: ciclo,
          }),
        });
        // PATCH em afiliados SÓ se realmente criou a row (não foi duplicata
        // ignorada). PostgREST com return=representation devolve [] em
        // conflito ignorado → length 0.
        const wasInsertedFresh = Array.isArray(inserted) && inserted.length > 0;
        if (wasInsertedFresh) {
          await sb(`afiliados?id=eq.${afiliado_id}`, {
            method: "PATCH",
            body: JSON.stringify({
              total_indicados: (af.total_indicados ?? 0) + 1,
              total_receita: Number(af.total_receita ?? 0) + Number(amount),
              updated_at: now.toISOString(),
            }),
          });
          console.log(`[webhook-mp] 💸 comissão R$${valorComissao} (${pct}%) → ${af.nome}`);
        }
      }
    } catch (err) {
      console.error("[webhook-mp] erro ao registrar comissão:", err);
    }
  }

  // 3) UPDATE users — ativa plano + registra trial (SE for o primeiro)
  if (isActive) {
    // Trial é DIREITO DE UM por conta: se o user já teve trial (cancelou
    // ou pagou pra valer antes), reassinar NÃO ganha trial de novo —
    // só ganha o plano. Sem esse check, atacante criava 5 preapprovals
    // sequenciais com cancel após cada `authorized` → trial farming infinito.
    //
    // Lê o estado atual antes de patch. Se user ainda nunca teve trial
    // (trial_ends_at IS NULL ou está expirado E plano é pending/free),
    // ATIVA trial. Caso contrário, NÃO toca trial_ends_at — só plano +
    // plano_expires_at + mp_preapproval_id.
    const userBefore = await sb(`users?id=eq.${user_id}&select=trial_ends_at,plano`, {
      method: "GET", headers: { Prefer: "" },
    });
    const beforeRow = Array.isArray(userBefore) ? userBefore[0] : null;
    const trialJaUsado = beforeRow?.trial_ends_at != null
      && new Date(beforeRow.trial_ends_at).getTime() < Date.now() + 24 * 60 * 60 * 1000;
    // trialJaUsado: tinha trial_ends_at no passado (já expirou ou está expirando hoje)
    // → não conceder trial novo, mas mantém o histórico.

    const patch = {
      plano,
      // plano_expires_at sempre toma o MAIOR entre o atual e o novo accessEnd —
      // webhook reentregue não pode encurtar plano de quem já estava ativo.
      plano_expires_at: maxIsoDate(beforeRow?.plano_expires_at, accessEnd.toISOString()),
      mp_preapproval_id: id,
    };
    if (!trialJaUsado) {
      patch.trial_ends_at = trialEnd.toISOString();
    }
    await sb(`users?id=eq.${user_id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    const status = trialJaUsado ? "reativou" : `ativou + trial até ${trialEnd.toISOString()}`;
    console.log(`[webhook-mp] ✅ ${user_id} ${status} ${plano}/${ciclo}`);
    trackPaymentCompleted(user_id, { plano, ciclo, amount, afiliado_id, trial_concedido: !trialJaUsado });
  } else if (isCanceled) {
    // Não rebaixa imediatamente — mantém plano até plano_expires_at expirar.
    console.log(`[webhook-mp] 🚫 ${user_id} cancelou ${plano}/${ciclo} — acesso mantido até plano_expires_at`);
  } else {
    console.log(`[webhook-mp] ⏳ ${user_id} status=${status}`);
  }
}

export default async (req) => {
  // MP às vezes manda GET pra healthcheck
  if (req.method === "GET") return new Response("OK");
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    console.log("[webhook-mp] MP token ausente — apenas loga e retorna 200.");
    return new Response("OK (placeholder)", { status: 200 });
  }

  let body = null;
  try { body = await req.json(); } catch {}
  const url = new URL(req.url);
  const topic = url.searchParams.get("topic") || body?.type || body?.topic;
  // PREFERIR body.data.id pra HMAC. MP calcula a assinatura com data.id do
  // payload, não com o id da query string. Quando body está vazio (raro,
  // reentrega só por query), cai pra URL como último recurso.
  const dataIdForHmac = body?.data?.id || body?.id || url.searchParams.get("id");
  const id = dataIdForHmac;

  console.log("[webhook-mp] recebido:", { topic, id, hmacSource: body?.data?.id ? "body" : "url" });

  // Valida HMAC. dataId precisa bater com o id que MP usou no manifesto.
  const sig = validateMpSignature(req, dataIdForHmac);
  if (!sig.ok) {
    console.error(`[webhook-mp] 🚨 HMAC inválido: ${sig.reason} — recusando request`);
    captureMessage(`webhook-mp HMAC inválido: ${sig.reason}`, "warning", { topic, id });
    return new Response("Invalid signature", { status: 401 });
  }
  if (sig.mode === "validated") {
    console.log("[webhook-mp] ✓ HMAC validado");
  }

  try {
    if (topic === "subscription_preapproval" || topic === "preapproval") {
      if (id) await handlePreapproval(id);
    } else {
      console.log("[webhook-mp] topic ignorado:", topic);
    }
  } catch (err) {
    console.error("[webhook-mp] erro:", err);
    captureException(err, { topic, id, source: "webhook-mp" });
    // Retorna 500 pra MP reentregar — antes devolvia 200 e ativações que
    // falhassem em erro transitório (Supabase 5xx, network) ficavam
    // perdidas pra sempre. Trade-off: bug não-transitório dispara loop
    // de retries até MP desistir (~24h). Sentry alert vai capturar.
    return new Response(JSON.stringify({ error: err?.message ?? "internal" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("OK", { status: 200 });
};

export const config = { path: "/api/webhook-mp" };
