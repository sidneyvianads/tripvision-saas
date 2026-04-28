import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, MapPin, AlertTriangle, Trash2 } from "lucide-react";
import Stars from "./ambient/Stars";
import Avatar from "./Avatar";
import { useIaConversa } from "../hooks/useIaConversa";
import { useRoteiro } from "../hooks/useRoteiro";
import { parseRoteiroUpdate, applyRoteiroUpdates, summarizeUpdates } from "../lib/roteiroParser";
import { buildRoteiroResumo, buildWelcomeMessage } from "../lib/roteiroResumo";
import { getPlanUsage, bumpPlanUsage } from "../lib/rateLimit";
import { ACTIVITY_TYPES } from "../data/types";

const LOADING_PHASES = [
  { delay: 0,    text: "Pensando…",                   icon: "💭" },
  { delay: 3000, text: "Pesquisando online…",         icon: "🔍" },
  { delay: 7000, text: "Buscando preços e endereços…", icon: "📍" },
  { delay: 12000, text: "Montando sugestões pra você…", icon: "✍️" },
];

export default function PlanChat({ trip, user, onGoToRoteiro }) {
  const { days, reload: reloadRoteiro } = useRoteiro(trip.id);
  const { messages, setMessages, persist, reset, loading: convLoading } = useIaConversa(trip.id, user?.id);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [usage, setUsage] = useState(() => getPlanUsage(user?.id));
  const [err, setErr] = useState(null);

  const scrollerRef = useRef(null);

  const welcome = useMemo(() => ({
    role: "assistant",
    content: buildWelcomeMessage(trip),
    _welcome: true,
  }), [trip?.id]);

  const renderedMessages = messages.length === 0 ? [welcome] : messages;

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [renderedMessages, busy]);

  // Loading phase rotation
  useEffect(() => {
    if (!busy) { setPhase(0); return; }
    const timers = LOADING_PHASES.map((p, i) =>
      setTimeout(() => setPhase(i), p.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const u = getPlanUsage(user.id);
    if (u.remaining <= 0) {
      setErr(`Você usou ${u.used}/${u.limit} mensagens de planejamento hoje. Volte amanhã ou ative o plano Grupo. ✨`);
      return;
    }

    setErr(null);
    const baseMessages = messages.length === 0 ? [welcome] : messages;
    const userMsg = { role: "user", content: text, ts: Date.now() };
    const next = [...baseMessages.filter((m) => !m._welcome), userMsg];
    setMessages(next);
    persist(next);
    setInput("");
    setBusy(true);

    const historyForApi = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyForApi,
          viagem: {
            nome: trip.nome,
            data_inicio: trip.data_inicio,
            data_fim: trip.data_fim,
            cidades: trip.cidades,
            num_pessoas: trip.num_pessoas,
            descricao: trip.descricao,
            roteiro_resumo: buildRoteiroResumo(days),
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const replyText = data?.reply ?? "(sem resposta)";

      const { cleanText, updates } = parseRoteiroUpdate(replyText);

      let appliedResults = null;
      if (updates && updates.length > 0) {
        appliedResults = await applyRoteiroUpdates(trip.id, updates);
        await reloadRoteiro();
      }

      const assistantMsg = {
        role: "assistant",
        content: cleanText || (appliedResults ? "✅ Atualizações aplicadas." : "(sem resposta)"),
        ts: Date.now(),
        _applied: appliedResults,
        _usage: data.usage ?? null,
      };
      const after = [...next, assistantMsg];
      setMessages(after);
      persist(after);

      const u2 = bumpPlanUsage(user.id);
      setUsage(u2);
    } catch (e) {
      console.error("[PlanChat] /api/plan failed:", e);
      const errMsg = {
        role: "assistant",
        content: "Tive um problema pra processar agora. Tente de novo daqui a pouco. ❄️",
        ts: Date.now(),
        _error: true,
      };
      const after = [...next, errMsg];
      setMessages(after);
      persist(after);
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Apagar toda a conversa de planejamento? O roteiro montado fica.")) return;
    await reset();
  };

  const currentPhase = LOADING_PHASES[phase] ?? LOADING_PHASES[0];

  return (
    <div
      className="flex flex-col h-[calc(100vh-180px)] px-3 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0D1B2A 0%, #0F1B2D 100%)" }}
    >
      <Stars count={45} />

      <div className="relative z-10 px-1 pt-2 pb-1 flex items-center justify-between text-[10px] font-display font-bold tracking-wide text-[#7CB9E8]/80 uppercase">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Planejar com IA
        </span>
        <span className="tabular">
          {usage.remaining} / {usage.limit} mensagens hoje
          {messages.length > 0 && (
            <button onClick={handleReset} className="ml-2 text-red-300 hover:text-red-200 inline-flex items-center gap-1" title="Apagar conversa">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </span>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto py-2 space-y-2.5 scrollbar-hide relative z-10">
        {convLoading && (
          <div className="text-center text-[#7CB9E8]/60 text-sm py-6">Carregando conversa…</div>
        )}

        {renderedMessages.map((m, idx) => (
          <Message
            key={`${m.ts ?? idx}-${idx}`}
            message={m}
            user={user}
            onGoToRoteiro={onGoToRoteiro}
          />
        ))}

        {busy && (
          <div className="flex gap-2 items-end justify-start animate-fade-up">
            <BotAvatar />
            <div
              className="rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]"
              style={{ background: "rgba(232, 240, 254, 0.95)", color: "#0F1B2D", boxShadow: "0 2px 12px rgba(124, 185, 232, 0.18)" }}
            >
              <div className="flex items-center gap-2 text-sm">
                <span>{currentPhase.icon}</span>
                <span>{currentPhase.text}</span>
              </div>
              <div className="flex gap-1 mt-1.5">
                <span className="dot w-1.5 h-1.5 rounded-full bg-[#7CB9E8]" />
                <span className="dot w-1.5 h-1.5 rounded-full bg-[#7CB9E8]" />
                <span className="dot w-1.5 h-1.5 rounded-full bg-[#7CB9E8]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {err && (
        <div className="relative z-10 mx-1 mb-2 rounded-xl bg-red-100/90 border border-red-300 px-3 py-2 text-red-900 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 py-3 relative z-10">
        <input
          className="input input-dark flex-1"
          placeholder="Conta como vocês querem viajar…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy || usage.remaining <= 0}
        />
        <button
          type="submit"
          className="btn-primary !p-3 rounded-full inline-flex items-center justify-center"
          disabled={!input.trim() || busy || usage.remaining <= 0}
          aria-label="Enviar"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

function BotAvatar() {
  return (
    <div
      className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base"
      style={{ background: "linear-gradient(135deg, #7CB9E8 0%, #2E86C1 100%)", boxShadow: "0 0 12px rgba(124, 185, 232, 0.5)" }}
    >
      <span>❄️</span>
    </div>
  );
}

function Message({ message, user, onGoToRoteiro }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 items-end animate-pop ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <BotAvatar />}
      <div className="max-w-[80%] flex flex-col items-stretch gap-2">
        {message.content && (
          <div
            className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${isUser ? "rounded-br-sm text-white" : "rounded-bl-sm"}`}
            style={isUser
              ? { background: "linear-gradient(135deg, #2E86C1 0%, #1B4F72 100%)", boxShadow: "0 2px 12px rgba(46, 134, 193, 0.30)" }
              : { background: "rgba(232, 240, 254, 0.95)", color: "#0F1B2D", boxShadow: "0 2px 12px rgba(124, 185, 232, 0.18)" }}
          >
            {message.content}
          </div>
        )}
        {!isUser && Array.isArray(message._applied) && message._applied.length > 0 && (
          <UpdateCard applied={message._applied} onGoToRoteiro={onGoToRoteiro} />
        )}
      </div>
      {isUser && user && <Avatar user={user} size={32} />}
    </div>
  );
}

function UpdateCard({ applied, onGoToRoteiro }) {
  const summary = summarizeUpdates(applied);
  const total = summary.added.length + summary.days.length + summary.updated.length + summary.removed.length;
  const hasErrors = summary.errors.length > 0;

  if (total === 0 && hasErrors) {
    return (
      <div className="rounded-2xl px-3 py-2 text-sm border" style={{ background: "rgba(252, 165, 165, 0.15)", borderColor: "rgba(252, 165, 165, 0.5)", color: "#fee2e2" }}>
        ⚠️ Tentei atualizar o roteiro mas {summary.errors.length} ação(ões) falharam.
      </div>
    );
  }

  // Agrupa add_activity por dia_numero pra exibir
  const byDay = new Map();
  for (const a of summary.added) {
    if (!byDay.has(a.dia_numero)) byDay.set(a.dia_numero, []);
    byDay.get(a.dia_numero).push(a);
  }
  for (const d of summary.days) {
    if (!byDay.has(d.dia_numero)) byDay.set(d.dia_numero, []);
  }

  return (
    <div
      className="rounded-2xl px-3 py-3 text-sm"
      style={{
        background: "linear-gradient(135deg, rgba(39, 174, 96, 0.18), rgba(39, 174, 96, 0.06))",
        border: "1px solid rgba(39, 174, 96, 0.45)",
        boxShadow: "0 2px 12px rgba(39, 174, 96, 0.18)",
        color: "#E8F0FE",
      }}
    >
      <div className="font-display font-extrabold text-[13px] flex items-center gap-1.5">
        ✅ Roteiro atualizado
      </div>

      <div className="mt-2 space-y-2">
        {summary.days.map((d, i) => (
          <div key={`d-${i}`} className="flex items-center gap-1.5 text-[12px] text-emerald-200">
            <MapPin className="w-3 h-3" />
            <span className="font-display font-bold">Dia {d.dia_numero}</span>
            <span className="opacity-90">— {d.titulo ?? "novo dia"}</span>
          </div>
        ))}

        {Array.from(byDay.entries()).map(([dia, list]) =>
          list.length > 0 ? (
            <div key={`day-${dia}`} className="text-[12px] space-y-0.5">
              <div className="font-display font-bold text-emerald-200">Dia {dia}</div>
              {list.map((a, i) => {
                const t = ACTIVITY_TYPES[a.tipo] ?? ACTIVITY_TYPES.livre;
                return (
                  <div key={`a-${dia}-${i}`} className="flex items-baseline gap-2 pl-3 text-[12px]">
                    <span className="tabular text-emerald-300/90 w-10 shrink-0">{a.horario || "—"}</span>
                    <span className="shrink-0">{t.icon}</span>
                    <span className="text-[#E8F0FE]/95">{a.titulo}</span>
                  </div>
                );
              })}
            </div>
          ) : null
        )}

        {summary.updated.length > 0 && (
          <div className="text-[12px] text-emerald-200/85">
            ✏️ {summary.updated.length} {summary.updated.length === 1 ? "atualização" : "atualizações"}
          </div>
        )}
        {summary.removed.length > 0 && (
          <div className="text-[12px] text-emerald-200/85">
            🗑️ {summary.removed.length} {summary.removed.length === 1 ? "remoção" : "remoções"}
          </div>
        )}
        {hasErrors && (
          <div className="text-[12px] text-amber-200">⚠️ {summary.errors.length} ação(ões) com erro</div>
        )}
      </div>

      {onGoToRoteiro && (
        <button
          type="button"
          onClick={onGoToRoteiro}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-display font-bold"
          style={{ background: "rgba(39, 174, 96, 0.25)", color: "#A7F3D0", border: "1px solid rgba(39, 174, 96, 0.55)" }}
        >
          Ver no roteiro →
        </button>
      )}
    </div>
  );
}
