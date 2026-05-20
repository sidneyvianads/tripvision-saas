// /api/create-subscription — cria preapproval no Mercado Pago.
// Quando MERCADOPAGO_ACCESS_TOKEN não está configurado, retorna 503
// com placeholder: true pra frontend mostrar "em breve" gracefully.
//
// AUTH: exige Authorization: Bearer <access_token>. userId e userEmail
// vêm do JWT, NÃO do body — antes era spam vector (atacante anônimo
// podia criar N preapprovals com user_id forjado polluindo dashboard MP
// e gastando rate-limit no Supabase em /afiliados lookup).
//
// RATE-LIMIT: 5 preapprovals/min por user, 10/min por IP. Stub mode até
// UPSTASH_REDIS_REST_URL ser setado.
//
// Trial de 7 dias APENAS no plano MENSAL. No anual o MP rejeitava o
// free_trial em alguns cenários, então pra não bloquear o cadastro o anual
// cobra direto (oferta de "33% off" já é o gancho dele).
//
// Cupom de afiliado: se vier no body, valida em afiliados e codifica o ID
// no external_reference (userId:plano:ciclo:afiliadoId:descPct). Webhook
// lê e calcula a comissão depois.
//
// Desconto: cada afiliado tem desconto_percent (0-50%). Quando aplicado, o
// transaction_amount do preapproval é reduzido. Como MP não suporta "preço
// diferente só no primeiro ciclo" nativamente, a redução vale enquanto o
// preapproval estiver com esse valor — caso queiram restaurar pro valor
// cheio depois do primeiro mês, usar PUT /preapproval/{id} com novo amount.

import { rateLimit, getClientIp } from "./_lib/rate-limit.mjs";
import { withRetry } from "./_lib/retry.mjs";

// R11-1: SITE_BASE precisa ser env-aware pra preview deploys.
// Antes hardcoded "https://viajjei.com.br" → preview deploys
// (deploy-preview-N--site.netlify.app) montavam back_url e
// notification_url apontando pra produção. PR fazia create-subscription
// e o webhook MP caía na função PROD, contaminando dados reais.
//
// Netlify injeta automaticamente:
//   - URL: domínio canônico do deploy atual (preview ou prod)
//   - DEPLOY_PRIME_URL: similar, com fallback pra URL
// Em local dev, sem essas vars, cai no fallback hardcoded.
const SITE_BASE = process.env.URL
  || process.env.DEPLOY_PRIME_URL
  || "https://viajjei.com.br";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_KEY;

// Valida JWT do Supabase Auth via /auth/v1/user. Mesmo padrão do
// cancel-subscription.mjs. Retorna {id, email, ...} ou null.
async function verifyAuth(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user : null;
  } catch (err) {
    console.error("[create-sub] verifyAuth erro:", err);
    return null;
  }
}

const TRIAL_DAYS = 7;

const PRICES = {
  pro: {
    mensal: { amount: 14.9,  reason: "Viajjei Pro — Mensal", frequency: 1,  type: "months" },
    anual:  { amount: 119.9, reason: "Viajjei Pro — Anual",  frequency: 12, type: "months" },
  },
  grupo: {
    mensal: { amount: 29.9,  reason: "Viajjei Grupo — Mensal", frequency: 1,  type: "months" },
    anual:  { amount: 239.9, reason: "Viajjei Grupo — Anual",  frequency: 12, type: "months" },
  },
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// R35-A: Mercado Pago /preapproval retorna 500 Internal Server Error
// (sem mensagem útil) pra emails com plus-addressing tipo
// "user+tag@gmail.com". Confirmado via curl direto contra api.mp.com/preapproval
// em 2026-05-20: mesmo payload, único diff `+teste99` no email → 500;
// sem `+` → 200 OK. Não há erro documentado no MP — é filtro interno.
//
// Solução: strip "+...@" antes de enviar pro MP. Email original fica
// preservado em users.email (Supabase). O cross-check do webhook-mp.mjs
// compara `pa.payer_email` (que o MP retorna VAZIO de qualquer jeito)
// vs users.email — então remover o tag aqui não afeta segurança.
//
// Casos cobertos:
//   "sidney+teste@gmail.com"      → "sidney@gmail.com"
//   "joao.silva@empresa.com.br"    → "joao.silva@empresa.com.br" (passthrough)
//   ""                              → ""
//   undefined                       → ""
export function stripPlusAddressing(email) {
  if (!email || typeof email !== "string") return "";
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const plus = local.indexOf("+");
  if (plus < 0) return email;
  return local.slice(0, plus) + domain;
}

async function fetchAfiliadoByCupom(cupom) {
  if (!cupom || !SUPABASE_URL || !SUPABASE_KEY) return null;
  // Normaliza ANTES de ir na URL pra eliminar % e outros wildcards de
  // ILIKE (atacante autenticado podia mandar cupom='%' no body e ganhar
  // o primeiro afiliado ativo).
  const code = String(cupom).trim().toUpperCase().slice(0, 30);
  if (!code) return null;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/afiliados?cupom=eq.${encodeURIComponent(code)}&ativo=eq.true&select=id,nome,cupom,comissao_percent,desconto_percent`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    return arr?.[0] ?? null;
  } catch (e) {
    console.warn("[create-sub] afiliado lookup falhou:", e);
    return null;
  }
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Debug — confirma qual token está em uso. APP_USR-* = produção, TEST-* = sandbox.
  // Logamos só o prefixo (8 chars) pra não vazar o token completo nos logs.
  const tok = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
  console.log("[MP] token prefix:", tok ? tok.slice(0, 8) + "…" : "(vazio)", "len:", tok.length);

  // Auth obrigatória — userId/userEmail saem do token, não do body
  const authedUser = await verifyAuth(req);
  if (!authedUser) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }
  const userId = authedUser.id;
  const userEmail = authedUser.email;

  // Rate limit: 5 preapprovals/min/user, 10/min/IP. Criar preapproval é
  // operação rara — bursts indicam spam/automação.
  const ip = getClientIp(req);
  const rl = await Promise.all([
    rateLimit({ key: `createsub:user:${userId}`, limit: 5, windowSec: 60 }),
    rateLimit({ key: `createsub:ip:${ip}`, limit: 10, windowSec: 60 }),
  ]);
  const blocked = rl.find((r) => !r.ok);
  if (blocked) {
    const resetIn = blocked.resetAt ? Math.max(1, Math.ceil((blocked.resetAt - Date.now()) / 1000)) : 60;
    return jsonResponse({ error: `Muitas tentativas. Tenta de novo em ${resetIn}s.` }, 429);
  }

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Requisição inválida." }, 400); }

  console.log("[MP] Request body (sanitized):", JSON.stringify({
    ...body, userId: undefined, userEmail: undefined,  // ignoramos do body
  }));

  const { plano, ciclo, cupom } = body ?? {};
  if (!plano || !ciclo) {
    return jsonResponse({ error: "Faltam campos: plano, ciclo." }, 400);
  }
  const cfg = PRICES[plano]?.[ciclo];
  if (!cfg) return jsonResponse({ error: `Plano/ciclo inválido: ${plano}/${ciclo}` }, 400);

  // Valida cupom (best-effort — não bloqueia se DB falhar)
  const afiliado = cupom ? await fetchAfiliadoByCupom(cupom) : null;
  const descontoPct = afiliado ? Number(afiliado.desconto_percent ?? 0) : 0;
  const finalAmount = descontoPct > 0
    ? round2(cfg.amount * (1 - descontoPct / 100))
    : cfg.amount;
  if (cupom) {
    console.log("[create-sub] cupom:", cupom, afiliado
      ? `→ afiliado ${afiliado.nome} (${afiliado.id}), desconto ${descontoPct}%, valor ${finalAmount}`
      : "→ inválido/não-encontrado");
  }

  // Placeholder mode — keys de produção ainda não configuradas
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    return jsonResponse({
      placeholder: true,
      message: "Pagamento será habilitado em breve. Por enquanto, escreva pra sidney@grupomultvision.com pra liberar manualmente.",
      plano,
      ciclo,
      amount: finalAmount,
      trial_days: TRIAL_DAYS,
    }, 503);
  }

  // external_reference: "userId:plano:ciclo[:afiliadoId[:descPct]]"
  const externalRef = afiliado
    ? `${userId}:${plano}:${ciclo}:${afiliado.id}:${descontoPct}`
    : `${userId}:${plano}:${ciclo}`;

  // Trial só no mensal. No anual o MP às vezes rejeita o free_trial; e o desconto
  // de 33% no anual já é o incentivo principal.
  const includeTrial = ciclo === "mensal";

  try {
    const auto_recurring = {
      frequency: cfg.frequency,
      frequency_type: cfg.type,
      transaction_amount: finalAmount,
      currency_id: "BRL",
    };
    if (includeTrial) {
      auto_recurring.free_trial = {
        frequency: TRIAL_DAYS,
        frequency_type: "days",
      };
    }

    const preapprovalBody = {
      reason: cfg.reason,
      external_reference: externalRef,
      // R35-A: MP rejeita "user+tag@..." com 500. Strip antes de enviar.
      payer_email: stripPlusAddressing(userEmail),
      back_url: `${SITE_BASE}/assinatura/sucesso`,
      notification_url: `${SITE_BASE}/api/webhook-mp`,
      auto_recurring,
      status: "pending",
    };

    console.log("[MP] Preapproval request to MP:", JSON.stringify(preapprovalBody));

    // withRetry: blip transitório (MP 502/503/timeout) era erro pro user
    // ter que clicar "tentar de novo". Agora retry interno de 2 tentativas.
    const { res, data } = await withRetry(async () => {
      const r = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(preapprovalBody),
      });
      const d = await r.json();
      // Só fail-and-retry em 5xx ou network errors (4xx do MP são validação,
      // não vai mudar com retry). Throw genérico aciona próximo attempt.
      if (r.status >= 500) {
        throw new Error(`MP preapproval ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
      }
      return { res: r, data: d };
    }, "mp-create-preapproval", 2, 500);
    console.log("[MP] Preapproval response", res.status, ":", JSON.stringify(data));

    if (!res.ok) {
      console.error("[create-subscription] MP error:", res.status, data);
      // Surfaceia o erro completo do MP no response pra debug via curl.
      return jsonResponse({
        error: data?.message ?? "Erro Mercado Pago",
        mp_status: res.status,
        mp_cause: data?.cause ?? null,
        mp_error: data?.error ?? null,
        details: data,
      }, 502);
    }
    return jsonResponse({
      preapproval_id: data.id,
      init_point: data.init_point,
      status: data.status,
      trial_days: includeTrial ? TRIAL_DAYS : 0,
      ciclo,
      cupom_aplicado: afiliado ? {
        nome: afiliado.nome,
        cupom: afiliado.cupom,
        desconto_percent: descontoPct,
        valor_original: cfg.amount,
        valor_com_desconto: finalAmount,
      } : null,
    });
  } catch (err) {
    console.error("[create-subscription] fetch failed:", err);
    return jsonResponse({ error: "Falha de rede com Mercado Pago.", details: String(err) }, 502);
  }
};

export const config = { path: "/api/create-subscription" };
