// /api/delete-account — deleta conta completa (LGPD direito ao esquecimento).
//
// Auth obrigatória via Bearer JWT do Supabase Auth. user_id sai do token.
// Service-role key derruba auth.users → CASCADE em public.users → CASCADE
// em viagens/membros/messages/roteiro/checklist/diário/contatos/ia_conversas.
//
// O que NÃO é deletado:
// - comissoes: FK ON DELETE SET NULL preserva histórico de audit (com
//   user_email_snapshot pra reconciliação contábil). Obrigação fiscal
//   de 5 anos sobrepõe direito ao esquecimento.
// - assinaturas no Mercado Pago: precisam ser canceladas separadamente
//   antes de deletar a conta. Webhook MP em sequência marca local como
//   canceled, mas o cancelamento real é responsabilidade do user.
//
// Antes esse delete era feito client-side via supabase.from("users").delete()
// — quebrava porque só removia row de public.users, deixando auth.users
// órfão (email queimado, user não conseguia recriar conta com mesmo email).

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

  // Confirmação explícita no body — extra safety contra POSTs acidentais.
  let body = {};
  try { body = await req.json(); } catch {}
  if (body?.confirm !== "DELETE_MY_ACCOUNT") {
    return new Response(JSON.stringify({
      error: 'Confirmação obrigatória. Mande {"confirm":"DELETE_MY_ACCOUNT"} no body.',
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    // Service-role: auth.admin.deleteUser via REST API do GoTrue.
    // CASCADE no FK public.users.id → auth.users.id apaga o profile +
    // tudo dependente (viagens, etc).
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${authed.id}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Supabase Auth admin ${res.status}: ${t.slice(0, 200)}`);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[delete-account] erro:", err);
    return new Response(JSON.stringify({ error: "Falha ao deletar conta.", detail: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/delete-account" };
