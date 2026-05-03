// /api/webhook-mp — recebe notificações do Mercado Pago.
// Atualiza users.plano + assinaturas com base no status do preapproval.
// Quando MERCADOPAGO_ACCESS_TOKEN não está configurado, apenas loga e
// retorna 200 pra MP não ficar reentregando.

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
}

function planoFromExternalRef(ref) {
  // formato: "userId:plano:ciclo"
  const [user_id, plano, ciclo] = (ref ?? "").split(":");
  return { user_id, plano, ciclo };
}

async function fetchPreapproval(id) {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`MP preapproval fetch ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

function periodEndFromCiclo(ciclo) {
  const d = new Date();
  if (ciclo === "anual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

async function handlePreapproval(id) {
  const pa = await fetchPreapproval(id);
  const { user_id, plano, ciclo } = planoFromExternalRef(pa.external_reference);
  if (!user_id) {
    console.warn("[webhook-mp] external_reference inválido:", pa.external_reference);
    return;
  }

  const status = pa.status; // pending, authorized, paused, cancelled
  const isActive = status === "authorized";
  const isCanceled = status === "cancelled" || status === "paused";

  // 1) UPSERT em assinaturas
  const subPayload = {
    user_id,
    plano,
    ciclo,
    status: isActive ? "active" : (isCanceled ? "canceled" : "pending"),
    provider: "mercadopago",
    mp_preapproval_id: id,
    amount: pa.auto_recurring?.transaction_amount ?? null,
    current_period_start: new Date().toISOString(),
    current_period_end: isActive ? periodEndFromCiclo(ciclo) : null,
    updated_at: new Date().toISOString(),
  };
  await sb(`assinaturas?on_conflict=mp_preapproval_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(subPayload),
  });

  // 2) UPDATE users.plano
  if (isActive) {
    await sb(`users?id=eq.${user_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        plano,
        plano_expires_at: periodEndFromCiclo(ciclo),
        mp_preapproval_id: id,
      }),
    });
    console.log(`[webhook-mp] ✅ ${user_id} ativou ${plano}/${ciclo}`);
  } else if (isCanceled) {
    // Não rebaixa imediatamente — mantém plano até plano_expires_at expirar.
    // O downgrade efetivo é feito pelo gate do /api/plan que checa expires_at.
    // Aqui só registra que NÃO haverá renovação.
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
  const id = url.searchParams.get("id") || body?.data?.id || body?.id;

  console.log("[webhook-mp] recebido:", { topic, id, body });

  try {
    if (topic === "subscription_preapproval" || topic === "preapproval") {
      if (id) await handlePreapproval(id);
    } else {
      console.log("[webhook-mp] topic ignorado:", topic);
    }
  } catch (err) {
    console.error("[webhook-mp] erro:", err);
    // Mesmo em erro retornamos 200 pra MP não reentregar infinitamente.
    // Erros ficam no log do Netlify Functions.
  }

  return new Response("OK", { status: 200 });
};

export const config = { path: "/api/webhook-mp" };
