import { ACTIVITY_TYPES } from "../data/types";

export default function ActivityItem({ activity, isLast }) {
  const t = ACTIVITY_TYPES[activity.tipo] ?? ACTIVITY_TYPES.livre;
  const isOpen = activity.status === "aberto";

  return (
    <div className="relative pl-9 pb-5 last:pb-0">
      {!isLast && (
        <span aria-hidden className="absolute left-3 top-5 bottom-0 w-0.5 rounded-full" style={{ background: "#E5E7EB" }} />
      )}
      <span
        aria-hidden
        className="absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs"
        style={{
          background: t.bg,
          border: `2px solid ${t.color}`,
          boxShadow: "0 0 0 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        {t.icon}
      </span>

      <div className="flex items-baseline gap-2">
        <span className="font-display font-extrabold text-sm tabular text-[#1F2937]">
          {activity.horario || "—"}
        </span>
        {isOpen && <span className="badge bg-amber-100 text-amber-800">em aberto</span>}
      </div>
      <div className={`mt-0.5 font-display font-bold text-base ${isOpen ? "text-[#9CA3AF]" : "text-[#1F2937]"}`}>
        {activity.titulo}
      </div>
      {activity.descricao && (
        <div className={`text-sm ${isOpen ? "text-[#9CA3AF]" : "text-[#4B5563]"}`}>
          {activity.descricao}
        </div>
      )}
      {(activity.endereco || activity.maps_url) && (
        <a
          href={activity.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.endereco)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs hover:underline mt-1 inline-block"
          style={{ color: "var(--tv-accent-dark)" }}
        >
          📍 {activity.endereco}
        </a>
      )}
      {activity.preco && (
        <div className="mt-1.5">
          <span className="badge" style={{ background: "#FEF3C7", color: "#92400E" }}>
            {activity.preco}
          </span>
        </div>
      )}
      {activity.notas && (
        <div className="mt-1.5 text-[12px] text-[#6B7280] italic flex gap-1">
          <span aria-hidden>📝</span>
          <span>{activity.notas}</span>
        </div>
      )}
    </div>
  );
}
