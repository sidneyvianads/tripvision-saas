import { useEffect, useState } from "react";
import { X, Loader2, Shield } from "lucide-react";
import { supabase } from "../lib/supabase";
import Avatar from "./Avatar";

const formatDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
  catch { return ""; }
};

export default function People({ viagemId, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("viagem_membros")
        .select("role, joined_at, user:users(id, nome, avatar_cor, avatar_url)")
        .eq("viagem_id", viagemId)
        .order("joined_at", { ascending: true });
      if (!active) return;
      if (error) setError(error.message);
      else setMembers(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [viagemId]);

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
            </div>
          </div>
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
        </div>
      </div>
    </div>
  );
}
