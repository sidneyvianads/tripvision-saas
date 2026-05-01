import { useEffect, useRef, useState } from "react";
import { Send, Lock, Sparkles } from "lucide-react";
import Avatar from "./Avatar";
import { useChat } from "../hooks/useChat";
import { getLimits } from "../data/plans";
import UpgradeModal from "./UpgradeModal";

const formatTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const dayKey = (iso) => { try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; } };
const formatDayLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  if (same(d, today)) return "Hoje";
  if (same(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
};

export default function GroupChat({ viagemId, user }) {
  const limits = getLimits(user?.plano);
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!limits.chat) {
    return (
      <div
        className="flex flex-col items-center justify-center h-[calc(100vh-180px)] px-4 text-center relative overflow-hidden"
        style={{ background: "linear-gradient(180deg, #0D1B2A 0%, #0F1B2D 100%)" }}
      >
        <div
          className="rounded-3xl p-8 max-w-sm"
          style={{ background: "rgba(232, 240, 254, 0.06)", border: "1px solid rgba(124, 185, 232, 0.30)" }}
        >
          <Lock className="w-10 h-10 text-[#7CB9E8] mx-auto" />
          <h3 className="font-display font-extrabold text-snow text-xl mt-3">Chat do grupo é Pro</h3>
          <p className="text-[#E8F0FE]/75 text-sm mt-2">
            Conversa em tempo real com sua família/grupo dentro do app — incluído a partir do plano Pro.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-display font-extrabold text-white"
            style={{ background: "linear-gradient(135deg, #E8834A 0%, #D4A574 100%)", boxShadow: "0 4px 16px rgba(232, 131, 74, 0.40)" }}
          >
            <Sparkles className="w-4 h-4" /> Assinar Pro
          </button>
        </div>
        <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="chat" user={user} />
      </div>
    );
  }

  return <GroupChatInner viagemId={viagemId} user={user} />;
}

function GroupChatInner({ viagemId, user }) {
  const { messages, profilesById, loading, sendMessage } = useChat(viagemId);
  const [text, setText] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  const handleSend = (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || !user?.id) return;
    sendMessage(t, user.id);
    setText("");
  };

  let lastDay = null;

  return (
    <div
      className="flex flex-col h-[calc(100vh-180px)] px-3"
      style={{ background: "linear-gradient(180deg, #0D1B2A 0%, #0F1B2D 100%)" }}
    >
      <div ref={ref} className="flex-1 overflow-y-auto py-3 space-y-2 scrollbar-hide">
        {loading && <div className="text-center text-[#7CB9E8]/60 text-sm py-6">Carregando…</div>}
        {!loading && messages.length === 0 && (
          <div className="text-center text-[#7CB9E8]/60 text-sm py-10">
            Nenhuma mensagem ainda.<br />Manda a primeira! ❄️
          </div>
        )}
        {messages.map((m) => {
          const mine = m.user_id === user?.id;
          const profile = profilesById[m.user_id];
          const author = mine ? user : (profile ?? { nome: "Viajante", avatar_cor: "#7CB9E8" });
          const cor = author?.avatar_cor ?? "#7CB9E8";
          const day = dayKey(m.created_at);
          const showSep = day !== lastDay;
          lastDay = day;

          if (m.is_system) {
            return (
              <div key={m.id}>
                {showSep && (
                  <div className="my-3 flex justify-center">
                    <span className="text-[10px] uppercase font-display font-bold tracking-wide px-3 py-1 rounded-full" style={{ background: "rgba(124, 185, 232, 0.12)", color: "#7CB9E8", border: "1px solid rgba(124, 185, 232, 0.20)" }}>
                      {formatDayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className="my-1.5 flex justify-center animate-fade-up">
                  <span className="text-[11px] text-[#9CA3AF] italic px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    {m.content}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id}>
              {showSep && (
                <div className="my-3 flex justify-center">
                  <span
                    className="text-[10px] uppercase font-display font-bold tracking-wide px-3 py-1 rounded-full"
                    style={{ background: "rgba(124, 185, 232, 0.12)", color: "#7CB9E8", border: "1px solid rgba(124, 185, 232, 0.20)" }}
                  >
                    {formatDayLabel(m.created_at)}
                  </span>
                </div>
              )}
              <div className={`flex gap-2 items-end animate-pop ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <Avatar user={author} size={32} />}
                <div
                  className={`max-w-[72%] rounded-2xl px-3 py-2 ${mine ? "rounded-br-sm text-white" : "rounded-bl-sm"}`}
                  style={mine
                    ? { background: "linear-gradient(135deg, #2E86C1 0%, #1B4F72 100%)", boxShadow: "0 2px 12px rgba(46, 134, 193, 0.30)" }
                    : { background: "rgba(232, 240, 254, 0.95)", color: "#0F1B2D", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.20)" }}
                >
                  {!mine && (
                    <div className="text-[11px] font-display font-bold mb-0.5" style={{ color: cor }}>
                      {author?.nome ?? "Viajante"}
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                  <div className={`text-[10px] mt-1 tabular ${mine ? "text-white/70" : "text-[#1A3A4A]/60"}`}>
                    {formatTime(m.created_at)}
                  </div>
                </div>
                {mine && <Avatar user={user} size={32} />}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 py-3 sticky bottom-0">
        <input
          className="input input-dark flex-1"
          placeholder="Mensagem para o grupo…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary !p-3 rounded-full inline-flex items-center justify-center"
          disabled={!text.trim()}
          aria-label="Enviar"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
