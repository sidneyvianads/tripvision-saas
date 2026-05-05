import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, MapPin, AlertTriangle, Trash2, RotateCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Avatar from "./Avatar";
import UpgradeModal from "./UpgradeModal";
import { useIaConversa } from "../hooks/useIaConversa";
import { useRoteiro } from "../hooks/useRoteiro";
import { parseRoteiroUpdate, applyRoteiroUpdates, summarizeUpdates, undoRoteiroUpdates } from "../lib/roteiroParser";
import { buildRoteiroResumo, buildWelcomeMessage } from "../lib/roteiroResumo";
import { getPlanUsage, bumpPlanUsage, setPlanUsageFromServer } from "../lib/rateLimit";
import { ACTIVITY_TYPES } from "../data/types";
import { isPaid, isOwner } from "../data/plans";
import { supabase } from "../lib/supabase";

const SUGESTOES = [
  "Sugere hotel",
  "O que fazer amanhã?",
  "Onde almoçar?",
  "Quanto vai custar?",
  "Passeio pra crianças",
  "Jei, monta o roteiro!",
];

const LOADING_PHASES = [
  { delay: 0,    text: "Pensando…",                    icon: "💭" },
  { delay: 3000, text: "Pesquisando online…",          icon: "🔍" },
  { delay: 7000, text: "Buscando preços e endereços…", icon: "📍" },
  { delay: 12000, text: "Montando sugestões pra você…", icon: "✍️" },
];

const ROTEIRO_OPEN = "<roteiro_update>";
const ROTEIRO_CLOSE = "</roteiro_update>";

// HARD GATE: contador local simples por user, DIÁRIO (reseta meia-noite).
// Chave: tripvision:ia_msgs:USER_ID:YYYY-MM-DD. Servidor é a verdade final.
const FREE_LIMIT = 5;
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const HARD_KEY = (uid) => `tripvision:ia_msgs:${uid}:${todayStr()}`;
function getFreeUsed(uid) {
  if (!uid) return 0;
  try { return parseInt(localStorage.getItem(HARD_KEY(uid)) || "0", 10) || 0; }
  catch { return 0; }
}
function bumpFreeUsed(uid) {
  if (!uid) return 0;
  const next = getFreeUsed(uid) + 1;
  try { localStorage.setItem(HARD_KEY(uid), String(next)); } catch {}
  return next;
}

function stripPartialRoteiroTag(text) {
  if (!text) return "";
  const open = text.indexOf(ROTEIRO_OPEN);
  if (open === -1) return text;
  const close = text.indexOf(ROTEIRO_CLOSE, open);
  if (close === -1) return text.slice(0, open).trimEnd();
  const after = close + ROTEIRO_CLOSE.length;
  return (text.slice(0, open) + text.slice(after)).trim();
}

async function streamPlan(req, signal, onDelta) {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    let err = null;
    try { err = await res.json(); } catch {}
    if (res.status === 403 && err?.upgrade) {
      const e = new Error(err?.error || "Limite Free atingido");
      e.code = "FREE_LIMIT";
      e.serverUsed = err?.used;
      e.serverLimit = err?.limit;
      throw e;
    }
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error("O Jei não respondeu. Tente de novo.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: eventos separados por linha em branco (\n\n)
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const block of events) {
      let dataStr = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) dataStr += line.slice(6);
      }
      if (!dataStr) continue;
      let data;
      try { data = JSON.parse(dataStr); } catch { continue; }

      if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
        const piece = data.delta.text || "";
        if (piece) {
          full += piece;
          onDelta(piece, full);
        }
      } else if (data.type === "error") {
        throw new Error(data.error?.message || "Erro retornado pelo stream.");
      }
    }
  }
  return full;
}

const MD_COMPONENTS_LIGHT = {
  p:      ({ children }) => <p className="m-0 leading-relaxed">{children}</p>,
  ul:     ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-display font-extrabold text-[#1F2937]">{children}</strong>,
  em:     ({ children }) => <em className="italic">{children}</em>,
  code:   ({ children }) => <code className="px-1 py-0.5 rounded bg-[#F3F4F6] text-[#374151] text-[0.9em]">{children}</code>,
  a:      ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline break-words" style={{ color: "var(--tv-accent-dark)" }}>{children}</a>,
  h1:     ({ children }) => <h1 className="text-base font-display font-extrabold text-[#1F2937] mt-1">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-sm font-display font-extrabold text-[#1F2937] mt-1">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-sm font-display font-bold text-[#1F2937] mt-1">{children}</h3>,
};

export default function PlanChat({ trip, user, onGoToRoteiro }) {
  const { days, reload: reloadRoteiro } = useRoteiro(trip.id);
  const { messages, setMessages, persist, reset, loading: convLoading } = useIaConversa(trip.id, user?.id);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  // freeUsed = único source of truth pra Free. Pro usa contador diário antigo só pra display.
  const [freeUsed, setFreeUsed] = useState(() => getFreeUsed(user?.id));
  const [usage, setUsage] = useState(() => getPlanUsage(user?.id, user?.plano));

  const isFree = !isPaid(user?.plano);
  const freeBlocked = isFree && freeUsed >= FREE_LIMIT;
  const proBlocked = !isFree && usage.remaining <= 0;
  const blocked = freeBlocked || proBlocked;

  useEffect(() => {
    console.log("[PlanChat] freeUsed:", freeUsed, "freeBlocked:", freeBlocked, "user.plano:", user?.plano, "blocked:", blocked);
  }, [freeUsed, freeBlocked, user?.plano, blocked]);

  // Sincroniza contador local com o BANCO (fonte da verdade) ao montar.
  // Free: count today. Pro/Grupo: count this month. localStorage é cache pra UX.
  useEffect(() => {
    if (!user?.id || isOwner(user?.plano)) return;
    let active = true;
    (async () => {
      try {
        const rpcName = isFree ? "count_ia_user_messages_today" : "count_ia_user_messages_in_month";
        const { data, error } = await supabase.rpc(rpcName, { uid: user.id });
        if (!active) return;
        if (error) {
          console.warn("[PlanChat] count rpc error:", error);
          return;
        }
        const serverCount = typeof data === "number" ? data : 0;
        if (isFree) {
          const localCount = getFreeUsed(user.id);
          const truth = Math.max(serverCount, localCount);
          if (truth !== localCount) {
            try { localStorage.setItem(HARD_KEY(user.id), String(truth)); } catch {}
          }
          setFreeUsed(truth);
          console.log("[PlanChat] free daily sync:", { server: serverCount, local: localCount, truth });
        } else {
          // Pro/Grupo: substitui contador local pelo do servidor (mensal autoritativo).
          setPlanUsageFromServer(user.id, user.plano, serverCount);
          setUsage(getPlanUsage(user.id, user.plano));
          console.log("[PlanChat] monthly sync:", { server: serverCount, plano: user.plano });
        }
      } catch (e) {
        console.warn("[PlanChat] sync failed:", e);
      }
    })();
    return () => { active = false; };
  }, [user?.id, user?.plano, isFree]);
  const [err, setErr] = useState(null);
  const [streamingText, setStreamingText] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [lastUserText, setLastUserText] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const scrollerRef = useRef(null);
  const abortRef = useRef(null);

  const welcome = useMemo(() => ({
    role: "assistant",
    content: buildWelcomeMessage(trip),
    _welcome: true,
  }), [trip?.id]);

  const renderedMessages = messages.length === 0 ? [welcome] : messages;

  // Auto-scroll: rolar pro fim quando chegam mensagens novas, durante stream e em loading
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [renderedMessages, streamingText, busy]);

  // Loading phase rotation: só roda enquanto não chegou o primeiro byte
  useEffect(() => {
    if (!busy || hasStarted) { setPhase(0); return; }
    const timers = LOADING_PHASES.map((p, i) =>
      setTimeout(() => setPhase(i), p.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [busy, hasStarted]);

  const runSend = async (text) => {
    if (busy) return;
    const trimmed = (text ?? "").trim();
    if (!trimmed) return;

    // ====== HARD GATE FREE — primeira coisa, antes de QUALQUER outra lógica ======
    if (user?.plano === "free" || !user?.plano) {
      const used = getFreeUsed(user?.id);
      console.log("[PlanChat HARD GATE FREE]", { used, limit: FREE_LIMIT, blocked: used >= FREE_LIMIT });
      if (used >= FREE_LIMIT) {
        setShowUpgrade(true);
        return; // NÃO ENVIA
      }
      // Incrementa ANTES de enviar (decisão deliberada do produto: msg falhada conta)
      const next = bumpFreeUsed(user.id);
      setFreeUsed(next);
    }
    // ====== /HARD GATE ======

    // Pro: contador diário (rateLimit antigo)
    if (isPaid(user.plano)) {
      const u = getPlanUsage(user.id, user.plano);
      if (u.remaining <= 0) {
        setErr(`Você usou ${u.used}/${u.limit} conversas com o Jei este mês. Renova no dia 1.`);
        return;
      }
    }

    setErr(null);
    setLastUserText(trimmed);

    const baseMessages = messages.length === 0 ? [welcome] : messages;
    const userMsg = { role: "user", content: trimmed, ts: Date.now() };
    const next = [...baseMessages.filter((m) => !m._welcome), userMsg];

    setMessages(next);
    persist(next);
    setInput("");
    setBusy(true);
    setHasStarted(false);
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;
    // Limite frouxo de 90s só pra cobrir falhas — o stream em si dá heartbeat
    const safetyTimer = setTimeout(() => controller.abort("safety-timeout"), 90_000);

    const historyForApi = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

    try {
      const fullText = await streamPlan(
        {
          message: trimmed,
          history: historyForApi,
          user_plano: user.plano ?? "free",
          user_id: user.id,
          viagem: {
            nome: trip.nome,
            data_inicio: trip.data_inicio,
            data_fim: trip.data_fim,
            cidades: trip.cidades,
            num_pessoas: trip.num_pessoas,
            descricao: trip.descricao,
            roteiro_resumo: buildRoteiroResumo(days),
          },
        },
        controller.signal,
        (_delta, full) => {
          setHasStarted(true);
          setStreamingText(full);
        }
      );
      clearTimeout(safetyTimer);

      console.log("[Viajjei] fullText recebido (", fullText.length, "chars):\n", fullText);

      const { cleanText, updates, raw } = parseRoteiroUpdate(fullText);
      console.log("[Viajjei] parse result:", { hasTag: !!raw, updatesCount: updates?.length ?? 0, updates });

      let appliedResults = null;
      if (updates && updates.length > 0) {
        appliedResults = await applyRoteiroUpdates(trip.id, updates);
        console.log("[Viajjei] apply result:", appliedResults);
        const errors = appliedResults.filter((r) => !r.success);
        if (errors.length) console.warn("[Viajjei] apply errors:", errors);
        await reloadRoteiro();
      } else if (raw) {
        console.warn("[Viajjei] tag <roteiro_update> apareceu mas JSON inválido — IA precisa corrigir formato.");
      } else {
        console.log("[Viajjei] sem <roteiro_update> nesta resposta (IA não confirmou ainda).");
      }

      const assistantMsg = {
        role: "assistant",
        content: cleanText || (appliedResults ? "✅ Atualizações aplicadas." : "(sem resposta)"),
        ts: Date.now(),
        _applied: appliedResults,
      };
      const after = [...next, assistantMsg];
      setMessages(after);
      persist(after);
      setStreamingText("");
      setLastUserText(null);
      // Pro: bump contador diário antigo. Free já foi bumpado ANTES do envio (hard gate).
      if (isPaid(user.plano)) {
        setUsage(bumpPlanUsage(user.id, user.plano));
      }
    } catch (e) {
      clearTimeout(safetyTimer);
      console.error("[PlanChat] stream failed:", e);

      // Servidor rejeitou: limite Free atingido (fonte da verdade no banco).
      if (e?.code === "FREE_LIMIT") {
        const truth = e.serverUsed ?? FREE_LIMIT;
        try { localStorage.setItem(HARD_KEY(user.id), String(truth)); } catch {}
        setFreeUsed(truth);
        // Remove a msg do user que acabou de ser adicionada — ela não foi processada.
        const rolledBack = next.slice(0, -1);
        setMessages(rolledBack);
        persist(rolledBack);
        setStreamingText("");
        setShowUpgrade(true);
        return;
      }

      const isAbort = e?.name === "AbortError" || /aborted/i.test(e?.message ?? "");
      const isHttp5xx = /HTTP\s+5\d{2}/.test(e?.message ?? "");
      const isTimeout = isAbort || isHttp5xx;
      const errMsg = {
        role: "assistant",
        content: isTimeout
          ? "O Jei está pesquisando muita coisa. Tenta perguntar uma coisa por vez! ⏱️"
          : `O Jei está com dificuldade pra processar agora: ${e.message}. Tenta de novo. 🧳`,
        ts: Date.now(),
        _error: true,
      };
      const after = [...next, errMsg];
      setMessages(after);
      persist(after);
      setStreamingText("");
      setErr(isTimeout ? "Timeout — pergunte uma coisa por vez." : (e.message || String(e)));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    runSend(input);
  };

  const handleRetry = () => {
    if (!lastUserText) return;
    setErr(null);
    // Remove a última mensagem de erro antes de retentar
    const lastIsError = messages[messages.length - 1]?._error;
    const cleaned = lastIsError ? messages.slice(0, -1) : messages;
    setMessages(cleaned);
    runSend(lastUserText);
  };

  const handleReset = async () => {
    if (busy) return;
    if (!confirm("Apagar toda a conversa de planejamento? O roteiro montado fica.")) return;
    await reset();
  };

  const currentPhase = LOADING_PHASES[phase] ?? LOADING_PHASES[0];
  const cleanedStream = stripPartialRoteiroTag(streamingText);
  const streamHasContent = busy && hasStarted && cleanedStream.length > 0;

  return (
    <div
      className="flex flex-col h-[calc(100vh-180px)] px-3 relative overflow-hidden"
      style={{ background: "var(--tv-bg-light)" }}
    >

      <div
        className="relative z-10 px-1 pt-2 pb-1 flex items-center justify-between text-[10px] font-display font-bold tracking-wide uppercase"
        style={{ color: "var(--tv-accent-dark)" }}
      >
        <span className="inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Planejar com o Jei
        </span>
        <span className="tabular flex items-center gap-2">
          <button
            onClick={() => runSend("Resuma todo o roteiro montado até agora, dia a dia.")}
            disabled={busy}
            className="normal-case font-display font-bold disabled:opacity-50 hover:opacity-80"
            style={{ color: "var(--tv-accent-dark)" }}
            title="Resumir roteiro"
          >
            📋 Resumir
          </button>
          <span>
            {isOwner(user?.plano)
              ? "👑 sem limite"
              : isFree
                ? `${freeUsed}/${FREE_LIMIT} conversas hoje`
                : `${usage.used}/${usage.limit} conversas este mês`}
          </span>
          {messages.length > 0 && !busy && (
            <button onClick={handleReset} className="text-red-500 hover:text-red-700 inline-flex items-center gap-1" title="Apagar conversa">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </span>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto py-2 space-y-2.5 scrollbar-hide relative z-10">
        {convLoading && (
          <div className="text-center text-[#6B7280] text-sm py-6">Carregando conversa…</div>
        )}

        {renderedMessages.map((m, idx) => (
          <Message
            key={`${m.ts ?? idx}-${idx}`}
            message={m}
            user={user}
            onGoToRoteiro={onGoToRoteiro}
            onRetry={m._error ? handleRetry : null}
            onUndo={async (applied) => {
              const result = await undoRoteiroUpdates(applied);
              await reloadRoteiro();
              return result;
            }}
          />
        ))}

        {/* Bolha em streaming: mostra texto parcial conforme chega */}
        {streamHasContent && (
          <div className="flex gap-2 items-end justify-start animate-fade-up">
            <BotAvatar />
            <div
              className="max-w-[80%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap break-words"
              style={{ background: "#FFFFFF", color: "#1F2937", border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)" }}
            >
              <ReactMarkdown components={MD_COMPONENTS_LIGHT}>{cleanedStream}</ReactMarkdown>
              <span
                className="inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse"
                style={{ background: "var(--tv-accent-dark)" }}
                aria-hidden
              />
            </div>
          </div>
        )}

        {/* Loading inicial (antes do primeiro byte) */}
        {busy && !hasStarted && (
          <div className="flex gap-2 items-end justify-start animate-fade-up">
            <BotAvatar />
            <div
              className="rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]"
              style={{ background: "#FFFFFF", color: "#1F2937", border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)" }}
            >
              <div className="flex items-center gap-2 text-sm">
                <span>{currentPhase.icon}</span>
                <span>{currentPhase.text}</span>
              </div>
              <div className="flex gap-1 mt-1.5">
                <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--tv-accent)" }} />
                <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--tv-accent)" }} />
                <span className="dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--tv-accent)" }} />
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

      {/* Banner de limite atingido (Free) */}
      {freeBlocked && (
        <div
          className="relative z-10 mx-1 mb-2 rounded-xl px-4 py-3"
          style={{ background: "linear-gradient(135deg, #FEF3C7, #FDE68A)", border: "1px solid #F59E0B" }}
        >
          <div className="text-[#92400E]">
            <div className="font-display font-extrabold text-sm flex items-center gap-1.5">
              ☀️ Suas {FREE_LIMIT} conversas com o Jei de hoje acabaram!
            </div>
            <div className="text-[13px] mt-1 leading-snug">
              Volte amanhã ou libere o Jei sem limites no plano Pro.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowUpgrade(true)}
            className="btn-primary mt-2.5 inline-flex items-center justify-center gap-1.5 !py-2 text-sm w-full"
          >
            <Sparkles className="w-3.5 h-3.5" /> Liberar o Jei — R$ 9,99/mês →
          </button>
          <button
            type="button"
            onClick={() => setShowUpgrade(false)}
            className="block w-full text-center mt-2 text-[12px] text-[#92400E]/80 hover:text-[#92400E] font-display font-bold"
          >
            Volto amanhã
          </button>
        </div>
      )}

      {/* Chips: ocultos se atingiu o limite */}
      {!busy && !blocked && (
        <div className="scroll-x-snap scrollbar-hide relative z-10 -mx-1 px-1 pb-1">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => runSend(s)}
              className="shrink-0 text-[12px] px-3 py-1.5 rounded-full font-display font-bold whitespace-nowrap"
              style={{ background: "#FFFFFF", color: "var(--tv-accent-dark)", border: "1px solid var(--tv-card-border)" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 py-3 relative z-10">
        <input
          className="input flex-1"
          placeholder={
            freeBlocked ? "Suas conversas de hoje acabaram. Volte amanhã!"
            : proBlocked ? "Você usou suas conversas deste mês."
            : "Conta pro Jei como vocês querem viajar…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy || blocked}
          onFocus={() => { if (freeBlocked) setShowUpgrade(true); }}
        />
        <button
          type="submit"
          className="btn-primary !p-3 rounded-full inline-flex items-center justify-center"
          disabled={!input.trim() || busy || blocked}
          aria-label="Enviar"
          onClick={(e) => {
            if (freeBlocked) {
              e.preventDefault();
              setShowUpgrade(true);
            }
          }}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="ia" user={user} />
    </div>
  );
}

function BotAvatar() {
  return (
    <div
      className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-display font-extrabold text-white text-sm"
      style={{ background: "#F97316", boxShadow: "0 2px 8px rgba(249, 115, 22, 0.30)" }}
      aria-label="Jei"
      title="Jei"
    >
      J
    </div>
  );
}

function Message({ message, user, onGoToRoteiro, onRetry, onUndo }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 items-end animate-pop ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <BotAvatar />}
      <div className="max-w-[80%] flex flex-col items-stretch gap-2">
        {message.content && (
          <div
            className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${isUser ? "rounded-br-sm text-white" : "rounded-bl-sm"}`}
            style={isUser
              ? { background: "var(--tv-gradient)", boxShadow: "0 2px 12px rgba(0, 0, 0, 0.12)" }
              : { background: "#FFFFFF", color: "#1F2937", border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)" }}
          >
            {isUser ? (
              message.content
            ) : (
              <ReactMarkdown components={MD_COMPONENTS_LIGHT}>{message.content}</ReactMarkdown>
            )}
          </div>
        )}

        {!isUser && message._error && onRetry && (
          <button
            onClick={onRetry}
            className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-display font-bold"
            style={{ background: "#FFFFFF", color: "var(--tv-accent-dark)", border: "1px solid var(--tv-card-border)" }}
          >
            <RotateCw className="w-3 h-3" />
            Tentar de novo
          </button>
        )}

        {!isUser && Array.isArray(message._applied) && message._applied.length > 0 && (
          <UpdateCard applied={message._applied} onGoToRoteiro={onGoToRoteiro} onUndo={onUndo} ts={message.ts} />
        )}
      </div>
      {isUser && user && <Avatar user={user} size={32} />}
    </div>
  );
}

const UNDO_WINDOW_MS = 30_000;
function UpdateCard({ applied, onGoToRoteiro, onUndo, ts }) {
  const summary = summarizeUpdates(applied);
  const total = summary.added.length + summary.days.length + summary.updated.length + summary.removed.length;
  const hasErrors = summary.errors.length > 0;

  // Undo só funciona se houver coisas inseridas (created_id) e dentro de 30s.
  const undoable = applied.some((r) => r.created_id);
  const [undone, setUndone] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!undoable || undone) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [undoable, undone]);
  const elapsed = now - (ts ?? now);
  const remaining = Math.max(0, UNDO_WINDOW_MS - elapsed);
  const canUndo = undoable && !undone && remaining > 0;

  const handleUndo = async () => {
    if (!onUndo) return;
    setUndoing(true);
    try {
      await onUndo(applied);
      setUndone(true);
    } catch (e) {
      console.error("[UpdateCard] undo failed:", e);
    } finally {
      setUndoing(false);
    }
  };

  if (undone) {
    return (
      <div
        className="rounded-2xl px-3 py-2 text-sm flex items-center gap-2"
        style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
      >
        <span className="opacity-70">↩️ Desfeito</span>
      </div>
    );
  }

  if (total === 0 && hasErrors) {
    return (
      <div className="rounded-2xl px-3 py-2 text-sm border" style={{ background: "rgba(252, 165, 165, 0.15)", borderColor: "rgba(252, 165, 165, 0.5)", color: "#fee2e2" }}>
        ⚠️ Tentei atualizar o roteiro mas {summary.errors.length} ação(ões) falharam.
      </div>
    );
  }

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
        background: "#065F46",
        border: "1px solid #047857",
        boxShadow: "0 4px 16px rgba(6, 95, 70, 0.25)",
        color: "#FFFFFF",
      }}
    >
      <div className="font-display font-extrabold text-[13px] flex items-center gap-1.5 text-white">
        ✅ Roteiro atualizado
      </div>

      <div className="mt-2 space-y-2">
        {summary.days.map((d, i) => (
          <div key={`d-${i}`} className="flex items-center gap-1.5 text-[12px]" style={{ color: "#D1FAE5" }}>
            <MapPin className="w-3 h-3" />
            <span className="font-display font-bold">Dia {d.dia_numero}</span>
            <span className="opacity-90">— {d.titulo ?? "novo dia"}</span>
          </div>
        ))}

        {Array.from(byDay.entries()).map(([dia, list]) =>
          list.length > 0 ? (
            <div key={`day-${dia}`} className="text-[12px] space-y-0.5">
              <div className="font-display font-bold" style={{ color: "#D1FAE5" }}>Dia {dia}</div>
              {list.map((a, i) => {
                const t = ACTIVITY_TYPES[a.tipo] ?? ACTIVITY_TYPES.livre;
                return (
                  <div key={`a-${dia}-${i}`} className="flex items-baseline gap-2 pl-3 text-[12px]">
                    <span className="tabular w-10 shrink-0" style={{ color: "#D1FAE5" }}>{a.horario || "—"}</span>
                    <span className="shrink-0">{t.icon}</span>
                    <span className="text-white">{a.titulo}</span>
                  </div>
                );
              })}
            </div>
          ) : null
        )}

        {summary.updated.length > 0 && (
          <div className="text-[12px]" style={{ color: "#D1FAE5" }}>
            ✏️ {summary.updated.length} {summary.updated.length === 1 ? "atualização" : "atualizações"}
          </div>
        )}
        {summary.removed.length > 0 && (
          <div className="text-[12px]" style={{ color: "#D1FAE5" }}>
            🗑️ {summary.removed.length} {summary.removed.length === 1 ? "remoção" : "remoções"}
          </div>
        )}
        {hasErrors && (
          <div className="text-[12px] text-amber-200">⚠️ {summary.errors.length} ação(ões) com erro</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {onGoToRoteiro && (
          <button
            type="button"
            onClick={onGoToRoteiro}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-display font-bold"
            style={{ background: "#FFFFFF", color: "#065F46", border: "1px solid #FFFFFF" }}
          >
            Ver no roteiro →
          </button>
        )}
        {canUndo && onUndo && (
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-display font-bold disabled:opacity-60"
            style={{ background: "rgba(255,255,255,0.15)", color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.40)" }}
            title={`Desfazer (${Math.ceil(remaining / 1000)}s)`}
          >
            ↩️ Desfazer · {Math.ceil(remaining / 1000)}s
          </button>
        )}
      </div>
    </div>
  );
}
