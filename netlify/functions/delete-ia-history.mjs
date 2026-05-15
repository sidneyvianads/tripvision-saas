// /api/delete-ia-history — apaga ia_conversas do user logado (LGPD).
// O user pode pedir pra remover só o histórico do Jei sem deletar a conta.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_KEY;

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
  } catch {
    return null;
  }
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authed = await verifyAuth(req);
  if (!authed) return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ia_conversas?user_id=eq.${authed.id}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=minimal",
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Supabase ${res.status}: ${t.slice(0, 200)}`);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[delete-ia-history] erro:", err);
    return new Response(JSON.stringify({ error: "Falha ao apagar histórico.", detail: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/delete-ia-history" };
