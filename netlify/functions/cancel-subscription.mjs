// /api/cancel-subscription — cancela preapproval ativo do usuário no Mercado Pago.
// Não rebaixa users.plano imediatamente — o usuário mantém acesso até
// users.plano_expires_at (final do período já pago). Webhook do MP confirma
// a mudança em assinaturas.status='canceled'.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sb(path, init = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env vars ausentes.");
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
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
    console.error("[cancel-sub] supabase error:", res.status, text);
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Requisição inválida." }, 400); }

  const { user_id } = body ?? {};
  if (!user_id) return jsonResponse({ error: "user_id é obrigatório." }, 400);

  // 1) Acha assinatura ativa do usuário
  let assinaturas;
  try {
    assinaturas = await sb(
      `assinaturas?user_id=eq.${user_id}&status=in.(active,pending,past_due)&order=created_at.desc&limit=1`,
      { method: "GET", headers: { Prefer: "" } }
    );
  } catch (e) {
    return jsonResponse({ error: "Falha ao consultar assinatura.", detail: e.message }, 500);
  }

  const assinatura = Array.isArray(assinaturas) ? assinaturas[0] : null;
  if (!assinatura) {
    return jsonResponse({ error: "Nenhuma assinatura ativa encontrada." }, 404);
  }
  const preapprovalId = assinatura.mp_preapproval_id;

  // 2) Cancela no Mercado Pago (se token configurado)
  if (process.env.MERCADOPAGO_ACCESS_TOKEN && preapprovalId) {
    try {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[cancel-sub] MP error:", res.status, errText);
        // Não falha — segue marcando local. MP webhook reconcilia depois.
      }
    } catch (err) {
      console.error("[cancel-sub] MP fetch failed:", err);
    }
  } else if (!preapprovalId) {
    console.warn("[cancel-sub] assinatura sem mp_preapproval_id — só atualiza local.");
  }

  // 3) Atualização otimista local — webhook confirma depois
  try {
    await sb(`assinaturas?id=eq.${assinatura.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "canceled",
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    return jsonResponse({ error: "Cancelado no MP mas falhou ao atualizar local.", detail: e.message }, 500);
  }

  return jsonResponse({
    ok: true,
    period_end: assinatura.current_period_end,
    message: "Assinatura cancelada. Você mantém acesso até o final do período pago.",
  });
};

export const config = { path: "/api/cancel-subscription" };
