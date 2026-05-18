// R14-6: People agora mostra membros + convites pendentes + botão Convidar.
// Admin vê tudo (membros e pending). Membro-comum vê só os membros
// (RLS bloqueia listagem de convites alheios — só vê os que tem o email
// dele OU é criador).

import { useCallback, useEffect, useState } from "react";
import { X, Loader2, Shield, UserPlus, Mail, Trash2, Check, Copy } from "lucide-react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errorMessages";
import Avatar from "./Avatar";
import { listPendingInvites, revokeInvite } from "../lib/invites";

const formatDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
  catch { return ""; }
};

const daysUntil = (iso) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
};

export default function People({ viagemId, isAdmin, onOpenInvite, onClose }) {
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linkCopiedId, setLinkCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, pRes] = await Promise.all([
      supabase
        .from("viagem_membros")
        .select("role, joined_at, user:users(id, nome, avatar_cor, avatar_url)")
        .eq("viagem_id", viagemId)
        .order("joined_at", { ascending: true }),
      // RLS: membros normais não veem nada aqui (não-admin + email não bate).
      // Admin vê todos os convites da viagem.
      listPendingInvites(viagemId),
    ]);
    if (mRes.error) {
      console.error("[People] load erro:", mRes.error);
      setError(friendlyError(mRes.error));
    } else {
      setMembers(mRes.data ?? []);
    }
    setPending(pRes);
    setLoading(false);
  }, [viagemId]);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (conviteId) => {
    const res = await revokeInvite(conviteId);
    if (res.ok) setPending((prev) => prev.filter((p) => p.id !== conviteId));
  };

  const copyInviteLink = async (token, id) => {
    const url = `${window.location.origin}/aceitar-convite?token=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiedId(id);
      setTimeout(() => setLinkCopiedId(null), 1800);
    } catch {
      prompt("Copie o link:", url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col animate-pop"
        style={{ background: "linear-gradient(180deg, #E8F0FE 0%, #FFFFFF 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gradient-primary text-white px-4 py-3 flex items-center gap-2">
          <div className="text-xl">❄️</div>
          <div className="flex-1">
            <div className="font-display font-extrabold leading-tight">Quem vai</div>
            <div className="text-[#7CB9E8] text-xs font-display font-bold">
              {loading ? "carregando…" : `${members.length} ${members.length === 1 ? "viajante" : "viajantes"}`}
              {pending.length > 0 && ` · ${pending.length} pendente${pending.length === 1 ? "" : "s"}`}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={onOpenInvite}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-xs font-display font-bold"
              title="Convidar pessoa"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Convidar
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-full bg-white/15 hover:bg-white/25" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[#7CB9E8]" />
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm m-2">{error}</div>
          )}
          {!loading && members.length === 0 && (
            <div className="text-center text-[#1A3A4A]/60 text-sm py-10">Nenhum viajante ainda.</div>
          )}

          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.user.id}>
                <div className="card p-3 flex items-center gap-3">
                  <Avatar user={m.user} size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-[#0F1B2D] flex items-center gap-1.5 truncate">
                      <span className="truncate">{m.user.nome}</span>
                      {m.role === "admin" && <Shield className="w-3.5 h-3.5 text-[#7CB9E8]" />}
                    </div>
                    <div className="text-xs text-[#1A3A4A]/60 mt-0.5">desde {formatDate(m.joined_at)}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Convites pendentes — só renderiza se houver algum (RLS já filtra
              o que o user pode ver). */}
          {!loading && pending.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-display font-bold uppercase tracking-wide text-[#6B7280] mb-2 px-1">
                <Mail className="w-3 h-3 inline mr-1" />
                Convites pendentes
              </div>
              <ul className="space-y-2">
                {pending.map((p) => (
                  <li key={p.id}>
                    <div className="card p-3 flex items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Mail className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold text-[#0F1B2D] text-sm truncate">{p.email}</div>
                        <div className="text-[11px] text-[#6B7280] mt-0.5">
                          {p.role === "admin" ? "Admin" : "Membro"} · expira em {daysUntil(p.expira_em)}d
                        </div>
                      </div>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => copyInviteLink(p.token, p.id)}
                            type="button"
                            className="p-1.5 rounded-lg hover:bg-[#F3F4F6]"
                            title="Copiar link"
                          >
                            {linkCopiedId === p.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-[#6B7280]" />}
                          </button>
                          <button
                            onClick={() => handleRevoke(p.id)}
                            type="button"
                            className="p-1.5 rounded-lg hover:bg-red-50"
                            title="Revogar"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
