import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Lock, Sparkles, Reply, SmilePlus, X } from "lucide-react";
import Avatar from "./Avatar";
import { useChat } from "../hooks/useChat";
import { getLimits } from "../data/plans";
import UpgradeModal from "./UpgradeModal";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

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
        style={{ background: "var(--tv-bg-light)" }}
      >
        <div className="card p-8 max-w-sm">
          <Lock className="w-10 h-10 mx-auto" style={{ color: "var(--tv-accent)" }} />
          <h3 className="font-display font-extrabold text-[#1F2937] text-xl mt-3">Chat do grupo é Pro</h3>
          <p className="text-[#4B5563] text-sm mt-2">
            Conversa com sua família/grupo dentro do app — todos veem na hora. Incluído a partir do Pro.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="btn-primary mt-5 inline-flex items-center gap-2"
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
  const { messages, profilesById, reactionsByMsg, loading, sendMessage, toggleReaction } = useChat(viagemId);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null); // { id, name, content }
  const [pickerFor, setPickerFor] = useState(null); // message_id or null
  const ref = useRef(null);
  const inputRef = useRef(null);
  const longPressTimer = useRef(null);

  // Index msgs by id pra resolver reply_to
  const msgsById = useMemo(() => {
    const map = new Map();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  // Fechar picker ao clicar fora
  useEffect(() => {
    if (!pickerFor) return;
    const onClick = () => setPickerFor(null);
    // Pequeno delay pra não fechar imediatamente após abrir
    const t = setTimeout(() => document.addEventListener("click", onClick, { once: true }), 50);
    return () => { clearTimeout(t); document.removeEventListener("click", onClick); };
  }, [pickerFor]);

  const handleSend = (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || !user?.id) return;
    sendMessage(t, user.id, replyingTo?.id ?? null);
    setText("");
    setReplyingTo(null);
  };

  const handleReply = (m) => {
    const author = m.user_id === user?.id ? user : (profilesById[m.user_id] ?? { nome: "Viajante" });
    setReplyingTo({ id: m.id, name: author?.nome ?? "Viajante", content: m.content });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const scrollToMessage = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[var(--tv-accent)]");
      setTimeout(() => el.classList.remove("ring-2", "ring-[var(--tv-accent)]"), 1500);
    }
  };

  const startLongPress = (mid) => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => setPickerFor(mid), 450);
  };
  const cancelLongPress = () => clearTimeout(longPressTimer.current);

  // R13-2: precomputa o flag de separador por id de mensagem ANTES do
  // .map(). Antes era `let lastDay = null` no escopo do componente e
  // mutado dentro do .map() — viola react-hooks/immutability porque
  // React 19 pode descartar/replay um render e a mutação persistia
  // entre as tentativas. useMemo escopa lastDay localmente.
  const sepByMsgId = useMemo(() => {
    const map = {};
    let lastDay = null;
    for (const m of messages) {
      const day = dayKey(m.created_at);
      map[m.id] = day !== lastDay;
      lastDay = day;
    }
    return map;
  }, [messages]);

  return (
    <div
      className="flex flex-col h-[calc(100vh-180px)] px-3"
      style={{ background: "var(--tv-bg-light)" }}
    >
      <div ref={ref} className="flex-1 overflow-y-auto py-3 space-y-2 scrollbar-hide">
        {loading && <div className="text-center text-[#6B7280] text-sm py-6">Carregando…</div>}
        {!loading && messages.length === 0 && (
          <div className="text-center text-[#6B7280] text-sm py-10">
            Nenhuma mensagem ainda.<br />Manda a primeira!
          </div>
        )}
        {messages.map((m) => {
          const mine = m.user_id === user?.id;
          const profile = profilesById[m.user_id];
          const author = mine ? user : (profile ?? { nome: "Viajante", avatar_cor: "#6366F1" });
          const cor = author?.avatar_cor ?? "#6366F1";
          const showSep = sepByMsgId[m.id];

          if (m.is_system) {
            return (
              <div key={m.id}>
                {showSep && (
                  <div className="my-3 flex justify-center">
                    <span className="text-[10px] uppercase font-display font-bold tracking-wide px-3 py-1 rounded-full" style={{ background: "#FFFFFF", color: "var(--tv-accent-dark)", border: "1px solid var(--tv-card-border)" }}>
                      {formatDayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className="my-1.5 flex justify-center animate-fade-up">
                  <span className="text-[11px] text-[#6B7280] italic px-3 py-1 rounded-full bg-white border border-[#E5E7EB]">
                    {m.content}
                  </span>
                </div>
              </div>
            );
          }

          const replied = m.reply_to ? msgsById.get(m.reply_to) : null;
          const repliedAuthor = replied
            ? (replied.user_id === user?.id ? user : (profilesById[replied.user_id] ?? { nome: "Viajante" }))
            : null;
          const rxList = reactionsByMsg?.[m.id] ?? [];
          const grouped = groupReactions(rxList);

          return (
            <div key={m.id} id={`msg-${m.id}`} className="rounded-2xl transition-shadow">
              {showSep && (
                <div className="my-3 flex justify-center">
                  <span
                    className="text-[10px] uppercase font-display font-bold tracking-wide px-3 py-1 rounded-full"
                    style={{ background: "#FFFFFF", color: "var(--tv-accent-dark)", border: "1px solid var(--tv-card-border)" }}
                  >
                    {formatDayLabel(m.created_at)}
                  </span>
                </div>
              )}

              <div className={`group flex gap-2 items-end animate-pop ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <Avatar user={author} size={32} />}

                <div className="max-w-[78%] flex flex-col gap-1 relative">
                  {/* Botões de ação (reply + reagir) */}
                  <div className={`absolute -top-3 ${mine ? "left-0 -translate-x-full pl-1" : "right-0 translate-x-full pr-1"} hidden group-hover:flex md:flex md:opacity-0 md:group-hover:opacity-100 gap-0.5 transition-opacity`}>
                    <button
                      onClick={() => handleReply(m)}
                      className="rounded-full bg-white border border-[#E5E7EB] p-1 shadow-sm hover:bg-gray-50"
                      aria-label="Responder"
                      title="Responder"
                    >
                      <Reply className="w-3 h-3 text-[#6B7280]" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPickerFor(pickerFor === m.id ? null : m.id); }}
                      className="rounded-full bg-white border border-[#E5E7EB] p-1 shadow-sm hover:bg-gray-50"
                      aria-label="Reagir"
                      title="Reagir"
                    >
                      <SmilePlus className="w-3 h-3 text-[#6B7280]" />
                    </button>
                  </div>

                  {/* Picker emoji */}
                  {pickerFor === m.id && (
                    <div
                      className={`absolute z-20 -top-12 ${mine ? "right-0" : "left-0"} flex gap-1 bg-white rounded-full px-2 py-1.5 shadow-lg border border-[#E5E7EB] animate-pop`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => { toggleReaction(m.id, user.id, emoji); setPickerFor(null); }}
                          className="text-lg hover:scale-125 transition-transform"
                          aria-label={`Reagir com ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    onTouchStart={() => startLongPress(m.id)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onContextMenu={(e) => { e.preventDefault(); setPickerFor(m.id); }}
                    className={`rounded-2xl px-3 py-2 ${mine ? "rounded-br-sm text-white" : "rounded-bl-sm"}`}
                    style={mine
                      ? { background: "var(--tv-gradient)", boxShadow: "0 2px 12px rgba(0, 0, 0, 0.12)" }
                      : { background: "#FFFFFF", color: "#1F2937", border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)" }}
                  >
                    {/* Mini-card da msg respondida */}
                    {replied && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(replied.id)}
                        className={`block w-full text-left mb-1.5 px-2 py-1 rounded-lg ${mine ? "bg-white/15 hover:bg-white/25" : "bg-gray-50 hover:bg-gray-100"} text-[11px] border-l-2`}
                        style={mine
                          ? { borderLeftColor: "rgba(255,255,255,0.6)" }
                          : { borderLeftColor: "var(--tv-accent)" }}
                      >
                        <div className={`font-display font-bold truncate ${mine ? "text-white" : ""}`} style={!mine ? { color: "var(--tv-accent-dark)" } : {}}>
                          {repliedAuthor?.nome ?? "Viajante"}
                        </div>
                        <div className={`truncate opacity-90 ${mine ? "text-white" : "text-[#4B5563]"}`}>
                          {(replied.content ?? "").slice(0, 80)}
                        </div>
                      </button>
                    )}

                    {!mine && (
                      <div className="text-[11px] font-display font-bold mb-0.5" style={{ color: cor }}>
                        {author?.nome ?? "Viajante"}
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                    <div className={`text-[10px] mt-1 tabular ${mine ? "text-white/70" : "text-[#9CA3AF]"}`}>
                      {formatTime(m.created_at)}
                    </div>
                  </div>

                  {/* Reações agrupadas */}
                  {grouped.length > 0 && (
                    <div className={`flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                      {grouped.map(({ emoji, count, mine: youReacted, names }) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => toggleReaction(m.id, user.id, emoji)}
                          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${youReacted ? "bg-white" : "bg-white/80"}`}
                          style={youReacted
                            ? { borderColor: "var(--tv-accent)", color: "var(--tv-accent-dark)" }
                            : { borderColor: "#E5E7EB", color: "#4B5563" }}
                          title={resolveReactorNames(names, profilesById, user)}
                        >
                          {emoji} {count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {mine && <Avatar user={user} size={32} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview de reply acima do input */}
      {replyingTo && (
        <div
          className="mb-1 mx-1 px-3 py-2 rounded-xl flex items-start gap-2 border"
          style={{ background: "#FFFFFF", borderColor: "var(--tv-card-border)" }}
        >
          <div className="flex-1 min-w-0 border-l-2 pl-2" style={{ borderColor: "var(--tv-accent)" }}>
            <div className="text-[11px] font-display font-bold" style={{ color: "var(--tv-accent-dark)" }}>
              Respondendo a {replyingTo.name}
            </div>
            <div className="text-[12px] text-[#6B7280] truncate">{replyingTo.content}</div>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-[#6B7280] hover:text-[#1F2937] p-0.5"
            aria-label="Cancelar resposta"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 py-3 sticky bottom-0">
        <input
          ref={inputRef}
          className="input flex-1"
          placeholder={replyingTo ? `Responder a ${replyingTo.name}…` : "Mensagem para o grupo…"}
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

function groupReactions(rxList) {
  const map = new Map();
  for (const r of rxList) {
    const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, names: [] };
    cur.count += 1;
    cur.names.push(r.user_id);
    map.set(r.emoji, cur);
  }
  return Array.from(map.values());
}

function resolveReactorNames(userIds, profilesById, currentUser) {
  return userIds
    .map((uid) => uid === currentUser?.id ? "Você" : (profilesById[uid]?.nome ?? "Viajante"))
    .join(", ");
}
