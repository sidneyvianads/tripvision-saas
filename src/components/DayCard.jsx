// DayCard — renderiza um dia do roteiro (header + atividades + hotel).
//
// R25-1: memoizado pra não re-renderizar quando o pai (RoteiroTab)
// re-renderiza por outra razão. Em viagem de 14 dias × 5 atividades,
// re-render desnecessário em cascata gera trabalho real.

import { memo, useMemo, useState } from "react";
import { ChevronDown, AlertTriangle, MapPin, Phone } from "lucide-react";
import ActivityItem from "./ActivityItem";

const formatBR = (iso) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

function DayCard({ day, expanded, onToggle, isToday, color }) {
  // R13-1: mountedAt fica estável entre renders (lazy useState init roda só
  // uma vez). Antes era Date.now() inline no JSX → impuro em React 19
  // concurrent rendering. Pra "clima em breve" não faz diferença se o
  // valor é o de mount ou o de agora — granularidade é dias, não ms.
  const [mountedAt] = useState(() => Date.now());

  // R25-1: extrai o IIFE de "Clima em breve" pra useMemo. Antes recalculava
  // a cada render do DayCard. Dep mínima: day.data (única input que muda
  // o resultado — mountedAt é estável por instância).
  const climaBadge = useMemo(() => {
    if (!day?.data) return null;
    const ms = new Date(day.data + "T00:00:00").getTime() - mountedAt;
    const dias = Math.round(ms / 86400000);
    if (dias > 0 && dias <= 7) {
      return <span className="text-[11px] text-[#0EA5E9]">🌤️ Clima em breve</span>;
    }
    return null;
  }, [day?.data, mountedAt]);

  return (
    <article
      className="card overflow-hidden transition-shadow"
      style={{
        borderLeft: `4px solid ${color ?? "var(--tv-accent)"}`,
        boxShadow: expanded
          ? "0 12px 28px rgba(15, 23, 42, 0.12)"
          : "0 4px 16px rgba(15, 23, 42, 0.06)",
      }}
    >
      <button
        onClick={onToggle ? () => onToggle(day.dia_numero) : undefined}
        className="w-full text-left flex items-center gap-3 p-4 hover:bg-[#F9FAFB] transition-colors"
        aria-expanded={expanded}
      >
        <div className="text-3xl select-none">{day.cover_emoji ?? "🗓️"}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-display font-bold tabular uppercase tracking-wide" style={{ color: "var(--tv-accent-dark)" }}>
              Dia {day.dia_numero}{day.weekday ? ` • ${day.weekday}` : ""}{day.data ? ` ${formatBR(day.data)}` : ""}
            </span>
            {isToday && <span className="badge bg-emerald-100 text-emerald-700">HOJE</span>}
            {day.alerta && <span className="badge bg-amber-100 text-amber-800">⚠️</span>}
          </div>
          <div className="font-display font-extrabold text-base text-[#1F2937] leading-tight mt-0.5 truncate">
            {day.titulo || "(sem título)"}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {day.cidade && (
              <span className="badge" style={{ background: "#F3F4F6", color: "#374151" }}>
                📍 {day.cidade}
              </span>
            )}
            <span className="text-xs text-[#6B7280] font-display font-bold">
              {day.atividades?.length ?? 0} {(day.atividades?.length ?? 0) === 1 ? "atividade" : "atividades"}
            </span>
            {climaBadge}
          </div>
        </div>

        <ChevronDown
          className="w-5 h-5 shrink-0 transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", color: "var(--tv-accent)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 animate-fade-up">
          {day.alerta && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 flex items-start gap-2 text-amber-900 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{day.alerta}</span>
            </div>
          )}

          {day.atividades?.length > 0 ? (
            <div className="card p-4">
              {day.atividades.map((a, idx) => (
                <ActivityItem key={a.id} activity={a} isLast={idx === day.atividades.length - 1} />
              ))}
            </div>
          ) : (
            <div className="card p-6 text-center text-sm text-[#6B7280]">
              Nenhuma atividade nesse dia ainda.
            </div>
          )}

          {day.hotel && (
            <div className="card p-4 mt-3">
              <div className="text-xs uppercase font-display font-bold text-[#6B7280] tracking-wide">Hotel</div>
              <div className="font-display font-extrabold text-base mt-0.5 text-[#1F2937]">{day.hotel}</div>
              {day.hotel_endereco && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(day.hotel_endereco + " " + (day.cidade ?? ""))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm hover:underline"
                  style={{ color: "var(--tv-accent-dark)" }}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {day.hotel_endereco}
                </a>
              )}
              {day.hotel_telefone && (
                <a
                  href={`tel:${day.hotel_telefone.replace(/\D/g, "")}`}
                  className="mt-2 ml-3 inline-flex items-center gap-1.5 text-sm text-[#27AE60] hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {day.hotel_telefone}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// R25-1: equality custom compara só fields que afetam render.
// `day` é objeto novo a cada reload do useRoteiro mesmo quando conteúdo
// igual — shallow default re-renderiza falsamente. Comparamos os
// campos individuais que importam pro JSX. Atividades comparam por
// length + ids concatenados (heurística rápida: se idx ou ID muda,
// re-renderiza; se só content mudou, escapamos — aceito porque o
// usuário tem que dar reload pra ver outras edições mesmo).
function arePropsEqual(prev, next) {
  if (prev.expanded !== next.expanded) return false;
  if (prev.isToday !== next.isToday) return false;
  if (prev.color !== next.color) return false;
  if (prev.onToggle !== next.onToggle) return false;
  const a = prev.day, b = next.day;
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  if (a.dia_numero !== b.dia_numero) return false;
  if (a.data !== b.data) return false;
  if (a.cidade !== b.cidade) return false;
  if (a.titulo !== b.titulo) return false;
  if (a.weekday !== b.weekday) return false;
  if (a.cover_emoji !== b.cover_emoji) return false;
  if (a.alerta !== b.alerta) return false;
  if (a.hotel !== b.hotel) return false;
  if (a.hotel_endereco !== b.hotel_endereco) return false;
  if (a.hotel_telefone !== b.hotel_telefone) return false;
  // Atividades: compara length + concatenação de ids (cheap signature).
  const aAct = a.atividades ?? [];
  const bAct = b.atividades ?? [];
  if (aAct.length !== bAct.length) return false;
  for (let i = 0; i < aAct.length; i++) {
    if (aAct[i]?.id !== bAct[i]?.id) return false;
  }
  return true;
}

export default memo(DayCard, arePropsEqual);
