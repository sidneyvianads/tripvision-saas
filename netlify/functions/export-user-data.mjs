// /api/export-user-data — LGPD Art.18-V portabilidade.
// Devolve JSON com todos os dados do user logado: profile, viagens
// (com membros, roteiro, atividades, checklist, contatos, diário),
// mensagens do chat, e conversas com o Jei.
//
// Auth: exige Authorization: Bearer <access_token>. user_id sai do JWT.
// Não inclui dados de outros users (mensagens dos co-membros são
// referenciadas só por user_id, não pelo conteúdo das outras pessoas).

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

async function sb(path) {
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export default async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const authed = await verifyAuth(req);
  if (!authed) return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: { "Content-Type": "application/json" } });
  const userId = authed.id;

  try {
    // Profile + viagens onde é membro (com tudo dentro)
    const [
      profile,
      viagens,
      membros,
      roteiroDias,
      roteiroAtividades,
      checklist,
      contatos,
      diario,
      messages,
      reactions,
      iaConversas,
      assinaturas,
    ] = await Promise.all([
      sb(`users?id=eq.${userId}&select=*`),
      // viagens onde é membro — join via viagem_membros
      sb(`viagens?select=*,viagem_membros!inner(user_id,role)&viagem_membros.user_id=eq.${userId}`),
      sb(`viagem_membros?user_id=eq.${userId}&select=*`),
      // roteiro de viagens onde é membro — usa view via FK
      sb(`roteiro_dias?select=*,viagens!inner(viagem_membros!inner(user_id))&viagens.viagem_membros.user_id=eq.${userId}`),
      sb(`roteiro_atividades?select=*,roteiro_dias!inner(viagens!inner(viagem_membros!inner(user_id)))&roteiro_dias.viagens.viagem_membros.user_id=eq.${userId}`),
      sb(`checklist?select=*,viagens!inner(viagem_membros!inner(user_id))&viagens.viagem_membros.user_id=eq.${userId}`),
      sb(`contatos?select=*,viagens!inner(viagem_membros!inner(user_id))&viagens.viagem_membros.user_id=eq.${userId}`),
      sb(`diario?select=*&user_id=eq.${userId}`),
      // mensagens do user em qualquer viagem
      sb(`messages?user_id=eq.${userId}&select=*`),
      sb(`reactions?user_id=eq.${userId}&select=*`),
      // conversas com o Jei
      sb(`ia_conversas?user_id=eq.${userId}&select=*`),
      sb(`assinaturas?user_id=eq.${userId}&select=*`),
    ]);

    const payload = {
      meta: {
        exported_at: new Date().toISOString(),
        user_id: userId,
        nota: "Este arquivo contém TODOS os seus dados pessoais armazenados no Viajjei (LGPD Art.18-V). Inclui apenas dados onde você é proprietário ou autor. Mensagens de outros membros das viagens não são exportadas. Guarde em local seguro.",
      },
      profile: profile?.[0] ?? null,
      viagens,
      viagem_membros: membros,
      roteiro_dias: roteiroDias,
      roteiro_atividades: roteiroAtividades,
      checklist,
      contatos,
      diario,
      messages,
      reactions,
      ia_conversas: iaConversas,
      assinaturas,
    };

    const json = JSON.stringify(payload, null, 2);
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="viajjei-export-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    console.error("[export-user-data] erro:", err);
    return new Response(JSON.stringify({ error: "Falha ao exportar.", detail: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/export-user-data" };
