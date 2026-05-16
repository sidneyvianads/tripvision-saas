// /api/cancel-subscription — cancela preapproval ativo do usuário no Mercado Pago.
// Não rebaixa users.plano imediatamente — o usuário mantém acesso até
// users.plano_expires_at (final do período já pago). Webhook do MP confirma
// a mudança em assinaturas.status='canceled'.
//
// AUTH: exige Authorization: Bearer <access_token> de Supabase Auth.
// O user_id é extraído do token (NÃO do body) — impede que qualquer um
// cancele a assinatura de outro chutando user_id no body.

import { withRetry } from "./_lib/retry.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_KEY;

// Verifica o JWT do header Authorization batendo no /auth/v1/user do Supabase.
// Supabase já valida a assinatura do JWT internamente. Retorna o user ou null.
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
    console.error("[cancel-sub] verifyAuth erro:", err);
    return null;
  }
}

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

  // Auth obrigatória — user_id vem do token, não do body
  const authedUser = await verifyAuth(req);
  if (!authedUser) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }
  const user_id = authedUser.id;

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

  // 2) Cancela no Mercado Pago (se token configurado) com retry — blip
  // transitório (5xx, network) não derruba o cancel: a função segue
  // marcando local e o webhook reconcilia depois.
  if (process.env.MERCADOPAGO_ACCESS_TOKEN && preapprovalId) {
    try {
      await withRetry(async () => {
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
          throw new Error(`MP cancel ${res.status}: ${errText.slice(0, 100)}`);
        }
      }, "mp-cancel", 2, 500);
    } catch (err) {
      console.error("[cancel-sub] MP fetch failed após retries:", err);
      // Não falha o handler — segue marcando local.
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
