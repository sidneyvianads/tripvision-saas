import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Avatar from "./Avatar";
import { supabase } from "../lib/supabase";
import { safeHref } from "../lib/safeHref";

// Markdown leve pra bolha do assistente. Links coloridos por tipo:
// 📸 Instagram = rosa, 🌐 Site = azul, 📍 Mapa = verde.
function flatChildrenText(children) {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flatChildrenText).join("");
  if (children.props?.children) return flatChildrenText(children.props.children);
  return "";
}
function detectLinkType(text, href) {
  if (text.includes("📸") || /instagram\.com/i.test(href)) return "instagram";
  if (text.includes("📍") || /maps\.google\.com|google\.com\/maps/i.test(href)) return "maps";
  if (text.includes("🌐")) return "site";
  return "default";
}
const LINK_STYLES = {
  instagram: { color: "#E1306C", fontSize: 13 },
  site:      { color: "#2563EB", fontSize: 13 },
  maps:      { color: "#059669", fontSize: 13 },
  default:   { color: "#F97316" },
};
function RichLink({ href, children }) {
  // R7-5: sanitiza href (allowlist http/https/mailto/tel). Defesa em
  // profundidade contra prompt injection — system prompt do Jei já tem
  // guarda-costas, mas LLM não é prova: defesa em camadas.
  const safe = safeHref(href);
  const text = flatChildrenText(children);
  const type = detectLinkType(text, safe);
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="font-display font-extrabold underline decoration-2 underline-offset-2 break-words hover:opacity-80 transition"
      style={LINK_STYLES[type]}
    >
      {children}
    </a>
  );
}

const MD_AI = {
  p:      ({ children }) => <p className="m-0 leading-relaxed">{children}</p>,
  ul:     ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-display font-extrabold">{children}</strong>,
  em:     ({ children }) => <em className="italic">{children}</em>,
  a:      ({ children, href }) => <RichLink href={href}>{children}</RichLink>,
};

export default function AiChat({ trip, days, user }) {
  const initialGreeting = {
    role: "assistant",
    content: `Olá! Sou seu concierge de "${trip?.nome ?? "viagem"}" ❄️ Pergunta o que quiser sobre o roteiro.`,
  };
  const [messages, setMessages] = useState([initialGreeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages, loading]);

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setErr(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada — faça login de novo.");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: text,
          history: next.slice(0, -1).filter((m) => m !== initialGreeting).map((m) => ({ role: m.role, content: m.content })),
          trip: {
            nome: trip?.nome,
            data_inicio: trip?.data_inicio,
            data_fim: trip?.data_fim,
            cidades: trip?.cidades,
            num_pessoas: trip?.num_pessoas,
            adultos: trip?.adultos,
            criancas: trip?.criancas,
            bebes: trip?.bebes,
            viaje_segura: trip?.viaje_segura,
            descricao: trip?.descricao,
          },
          roteiro: (days ?? []).map((d) => ({
            dia: d.dia_numero,
            data: d.data,
            cidade: d.cidade,
            titulo: d.titulo,
            hotel: d.hotel,
            atividades: (d.atividades ?? []).map((a) => ({
              hora: a.horario, titulo: a.titulo, tipo: a.tipo, desc: a.descricao,
            })),
          })),
        }),
      });
      if (!res.ok) throw new Error("upstream");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "(sem resposta)" }]);
    } catch (e2) {
      console.error("[AiChat] erro:", e2?.message ?? e2);
      // Mensagem fixa pro usuário — não interpolar e2.message.
      const FRIENDLY = "O Jei está ocupado agora. Tenta de novo em alguns segundos! 😊";
      setErr(FRIENDLY);
      setMessages((prev) => [...prev, { role: "assistant", content: FRIENDLY }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col h-[calc(100vh-180px)] px-3 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0D1B2A 0%, #0F1B2D 100%)" }}
    >

      <div ref={ref} className="flex-1 overflow-y-auto py-3 space-y-2.5 scrollbar-hide relative z-10">
        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div key={idx} className={`flex gap-2 items-end animate-pop ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div
                  className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base"
                  style={{ background: "linear-gradient(135deg, #7CB9E8 0%, #2E86C1 100%)", boxShadow: "0 0 12px rgba(124, 185, 232, 0.5)" }}
                >
                  <span>❄️</span>
                </div>
              )}
              <div
                className={`max-w-[76%] rounded-2xl px-3 py-2 text-sm break-words ${
                  isUser ? "rounded-br-sm text-white whitespace-pre-wrap" : "rounded-bl-sm"
                }`}
                style={isUser
                  ? { background: "linear-gradient(135deg, #2E86C1 0%, #1B4F72 100%)", boxShadow: "0 2px 12px rgba(46, 134, 193, 0.30)" }
                  : { background: "rgba(232, 240, 254, 0.95)", color: "#0F1B2D", boxShadow: "0 2px 12px rgba(124, 185, 232, 0.18)" }}
              >
                {isUser ? m.content : <ReactMarkdown components={MD_AI}>{m.content}</ReactMarkdown>}
              </div>
              {isUser && user && <Avatar user={user} size={32} />}
            </div>
          );
        })}
        {loading && (
          <div className="flex gap-2 items-end justify-start">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7CB9E8 0%, #2E86C1 100%)" }}
            >❄️</div>
            <div
              className="rounded-2xl rounded-bl-sm px-4 py-3"
              style={{ background: "rgba(232, 240, 254, 0.95)", boxShadow: "0 2px 12px rgba(124, 185, 232, 0.18)" }}
            >
              <div className="flex gap-1">
                <span className="dot w-2 h-2 rounded-full bg-[#7CB9E8]" />
                <span className="dot w-2 h-2 rounded-full bg-[#7CB9E8]" />
                <span className="dot w-2 h-2 rounded-full bg-[#7CB9E8]" />
              </div>
            </div>
          </div>
        )}
        {err && <div className="text-xs text-red-300 px-1">{err}</div>}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 py-3 relative z-10">
        <input
          className="input input-dark flex-1"
          placeholder="Pergunte sobre essa viagem…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-primary !p-3 rounded-full inline-flex items-center justify-center"
          disabled={!input.trim() || loading}
          aria-label="Enviar"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
