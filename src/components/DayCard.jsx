import { ChevronDown, AlertTriangle, MapPin, Phone } from "lucide-react";
import ActivityItem from "./ActivityItem";

const formatBR = (iso) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export default function DayCard({ day, expanded, onToggle, isToday, color }) {
  return (
    <article
      className="card overflow-hidden transition-shadow"
      style={{
        borderLeft: `4px solid ${color ?? "#7CB9E8"}`,
        boxShadow: expanded
          ? "0 12px 28px rgba(15, 27, 45, 0.35)"
          : "0 4px 16px rgba(15, 27, 45, 0.18)",
      }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-3 p-4 hover:bg-[#E8F0FE]/40 transition-colors"
        aria-expanded={expanded}
      >
        <div className="text-3xl select-none">{day.cover_emoji ?? "🗓️"}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-display font-bold tabular text-[#1A3A4A] uppercase tracking-wide">
              Dia {day.dia_numero}{day.weekday ? ` • ${day.weekday}` : ""}{day.data ? ` ${formatBR(day.data)}` : ""}
            </span>
            {isToday && <span className="badge bg-emerald-100 text-emerald-700">HOJE</span>}
            {day.alerta && <span className="badge bg-amber-100 text-amber-800">⚠️</span>}
          </div>
          <div className="font-display font-extrabold text-base text-[#0F1B2D] leading-tight mt-0.5 truncate">
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
            {day.data && (() => {
              const ms = new Date(day.data + "T00:00:00").getTime() - Date.now();
              const dias = Math.round(ms / 86400000);
              if (dias > 0 && dias <= 7) {
                return <span className="text-[11px] text-[#0EA5E9]">🌤️ Clima em breve</span>;
              }
              return null;
            })()}
          </div>
        </div>

        <ChevronDown
          className="w-5 h-5 text-[#7CB9E8] shrink-0 transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
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
            <div className="card p-6 text-center text-sm text-[#1A3A4A]/60">
              Nenhuma atividade nesse dia ainda.
            </div>
          )}

          {day.hotel && (
            <div className="card p-4 mt-3">
              <div className="text-xs uppercase font-display font-bold text-[#1A3A4A]/70 tracking-wide">Hotel</div>
              <div className="font-display font-extrabold text-base mt-0.5 text-[#0F1B2D]">{day.hotel}</div>
              {day.hotel_endereco && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(day.hotel_endereco + " " + (day.cidade ?? ""))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#2E86C1] hover:underline"
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
