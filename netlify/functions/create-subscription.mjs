// /api/create-subscription — cria preapproval no Mercado Pago.
// Quando MERCADOPAGO_ACCESS_TOKEN não está configurado, retorna 503
// com placeholder: true pra frontend mostrar "em breve" gracefully.

const SITE_BASE = "https://tripvision-saas.netlify.app";

const PRICES = {
  pro: {
    mensal: { amount: 14.9,  reason: "Voyajei Pro — Mensal", frequency: 1,  type: "months" },
    anual:  { amount: 119.9, reason: "Voyajei Pro — Anual",  frequency: 12, type: "months" },
  },
  grupo: {
    mensal: { amount: 29.9,  reason: "Voyajei Grupo — Mensal", frequency: 1,  type: "months" },
    anual:  { amount: 239.9, reason: "Voyajei Grupo — Anual",  frequency: 12, type: "months" },
  },
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Requisição inválida." }, 400); }

  const { plano, ciclo, userId, userEmail } = body ?? {};
  if (!plano || !ciclo || !userId || !userEmail) {
    return jsonResponse({ error: "Faltam campos: plano, ciclo, userId, userEmail." }, 400);
  }
  const cfg = PRICES[plano]?.[ciclo];
  if (!cfg) return jsonResponse({ error: `Plano/ciclo inválido: ${plano}/${ciclo}` }, 400);

  // Placeholder mode — keys de produção ainda não configuradas
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    return jsonResponse({
      placeholder: true,
      message: "Pagamento será habilitado em breve. Por enquanto, escreva pra sidney@grupomultvision.com pra liberar manualmente.",
      plano,
      ciclo,
      amount: cfg.amount,
    }, 503);
  }

  try {
    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        reason: cfg.reason,
        external_reference: `${userId}:${plano}:${ciclo}`,
        payer_email: userEmail,
        back_url: `${SITE_BASE}/assinatura/sucesso`,
        notification_url: `${SITE_BASE}/api/webhook-mp`,
        auto_recurring: {
          frequency: cfg.frequency,
          frequency_type: cfg.type,
          transaction_amount: cfg.amount,
          currency_id: "BRL",
        },
        status: "pending",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[create-subscription] MP error:", res.status, data);
      return jsonResponse({ error: data?.message ?? "Erro Mercado Pago", details: data }, 502);
    }
    return jsonResponse({
      preapproval_id: data.id,
      init_point: data.init_point,
      status: data.status,
    });
  } catch (err) {
    console.error("[create-subscription] fetch failed:", err);
    return jsonResponse({ error: "Falha de rede com Mercado Pago." }, 502);
  }
};

export const config = { path: "/api/create-subscription" };
