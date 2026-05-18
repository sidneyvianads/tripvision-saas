// Client helpers pra invite flow. Wrappam supabase.rpc + envio de email
// via /api/send-invite-email. Componentes (ShareModal, People) consomem
// só essas funções pra não ficar duplicando o try/catch + email push.

import { supabase } from "./supabase";

const norm = (s) => String(s ?? "").trim();
const normEmail = (s) => norm(s).toLowerCase();

// Lista convites pendentes da viagem (admin vê tudo, criador vê os seus,
// convidado vê só os pra ele — RLS resolve).
export async function listPendingInvites(viagemId) {
  if (!viagemId) return [];
  const { data, error } = await supabase
    .from("viagem_convites")
    .select("id, email, role, token, criado_em, expira_em, aceito_em")
    .eq("viagem_id", viagemId)
    .is("aceito_em", null)
    .gt("expira_em", new Date().toISOString())
    .order("criado_em", { ascending: false });
  if (error) {
    console.error("[invites] list erro:", error);
    return [];
  }
  return data ?? [];
}

// Cria convite via RPC + dispara email (best-effort).
// Retorna { ok, token?, email?, expira_em?, motivo?, already_pending?, accept_url? }.
export async function createInvite({ viagemId, email, role = "membro", inviterNome, trip }) {
  const cleanEmail = normEmail(email);
  if (!cleanEmail) return { ok: false, motivo: "invalid_email" };
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    return { ok: false, motivo: "invalid_email" };
  }
  const { data, error } = await supabase.rpc("invite_to_trip", {
    p_viagem_id: viagemId,
    p_email: cleanEmail,
    p_role: role === "admin" ? "admin" : "membro",
  });
  if (error) {
    console.error("[invites] RPC invite_to_trip erro:", error);
    // Permission denied → propaga pra UI mostrar "só admin pode convidar"
    if (/permission denied/i.test(error.message)) {
      return { ok: false, motivo: "permission_denied" };
    }
    return { ok: false, motivo: "rpc_error", details: error.message };
  }
  if (!data?.ok) return data ?? { ok: false, motivo: "unknown" };

  // Dispara email via Netlify Function. Falha aqui NÃO derruba o convite —
  // ele já foi criado no banco. Retornamos accept_url pra UI mostrar
  // fallback "copiar link".
  const acceptUrl = `${window.location.origin}/aceitar-convite?token=${encodeURIComponent(data.token)}`;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch("/api/send-invite-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          viagem_id: viagemId,
          invite_token: data.token,
          email: cleanEmail,
          inviter_nome: inviterNome,
          trip: {
            nome: trip?.nome,
            cidades: trip?.cidades,
            data_inicio: trip?.data_inicio,
            data_fim: trip?.data_fim,
          },
        }),
      });
      const emailRes = await res.json().catch(() => ({}));
      return { ...data, accept_url: acceptUrl, email_sent: !!emailRes.sent, email_stub: !!emailRes.stub };
    }
  } catch (e) {
    console.warn("[invites] email enviar falhou (convite ainda OK):", e);
  }
  return { ...data, accept_url: acceptUrl, email_sent: false };
}

export async function revokeInvite(conviteId) {
  if (!conviteId) return { ok: false };
  const { data, error } = await supabase.rpc("revoke_invite", { p_convite_id: conviteId });
  if (error) {
    console.error("[invites] revoke erro:", error);
    return { ok: false, motivo: "rpc_error" };
  }
  return data ?? { ok: false };
}

// Conta members + convites pendentes pra mostrar "X de Y vagas".
// Usa duas queries paralelas em vez de uma RPC pra ficar simples — o
// custo é dois roundtrips mas a UI já está numa tela secundária.
export async function getInviteCapacity(viagemId) {
  if (!viagemId) return { members: 0, pending: 0, limit: 1 };
  const [m, p, t] = await Promise.all([
    supabase.from("viagem_membros").select("user_id", { count: "exact", head: true }).eq("viagem_id", viagemId),
    supabase.from("viagem_convites").select("id", { count: "exact", head: true })
      .eq("viagem_id", viagemId).is("aceito_em", null).gt("expira_em", new Date().toISOString()),
    supabase.from("viagens").select("owner_id").eq("id", viagemId).maybeSingle(),
  ]);
  let limit = 1;
  if (t.data?.owner_id) {
    const { data } = await supabase.rpc("plan_member_limit", { p_user_id: t.data.owner_id });
    if (typeof data === "number") limit = data;
  }
  return {
    members: m.count ?? 0,
    pending: p.count ?? 0,
    limit,
  };
}
