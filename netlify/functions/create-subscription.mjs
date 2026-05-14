// /api/create-subscription — cria preapproval no Mercado Pago.
// Quando MERCADOPAGO_ACCESS_TOKEN não está configurado, retorna 503
// com placeholder: true pra frontend mostrar "em breve" gracefully.
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

const SITE_BASE = "https://viajjei.com.br";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

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

async function fetchAfiliadoByCupom(cupom) {
  if (!cupom || !SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/afiliados?cupom=ilike.${encodeURIComponent(cupom)}&ativo=eq.true&select=id,nome,cupom,comissao_percent,desconto_percent`;
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

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Requisição inválida." }, 400); }

  console.log("[MP] Request body:", JSON.stringify(body));

  const { plano, ciclo, userId, userEmail, cupom } = body ?? {};
  if (!plano || !ciclo || !userId || !userEmail) {
    return jsonResponse({ error: "Faltam campos: plano, ciclo, userId, userEmail." }, 400);
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
      payer_email: userEmail,
      back_url: `${SITE_BASE}/assinatura/sucesso`,
      notification_url: `${SITE_BASE}/api/webhook-mp`,
      auto_recurring,
      status: "pending",
    };

    console.log("[MP] Preapproval request to MP:", JSON.stringify(preapprovalBody));

    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preapprovalBody),
    });
    const data = await res.json();
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
