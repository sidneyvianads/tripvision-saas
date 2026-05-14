import { CalendarDays, MessageCircle, Sparkles, CheckSquare, Camera } from "lucide-react";

const TABS = [
  { id: "roteiro",  label: "Roteiro",  Icon: CalendarDays },
  { id: "planejar", label: "Planejar", Icon: Sparkles },
  { id: "chat",     label: "Chat",     Icon: MessageCircle },
  { id: "tarefas",  label: "Tarefas",  Icon: CheckSquare },
  { id: "diario",   label: "Diário",   Icon: Camera },
];

export default function TabBar({ active, onChange, badges = {} }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 safe-bottom bg-white"
      style={{
        borderTop: "1px solid #E5E7EB",
        boxShadow: "0 -2px 12px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div className="max-w-2xl mx-auto grid grid-cols-5">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          const badge = badges[id];
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center justify-center gap-1 py-2.5 transition-colors relative"
              aria-label={label}
            >
              <div className="relative">
                <Icon
                  className="w-5 h-5"
                  style={{ color: isActive ? "var(--tv-accent, #6366F1)" : "#9CA3AF" }}
                  strokeWidth={isActive ? 2.5 : 2}
                  fill={isActive ? "color-mix(in srgb, var(--tv-accent, #6366F1) 18%, transparent)" : "none"}
                />
                {badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] font-display font-extrabold text-white tabular px-1"
                    style={{ background: "#EF4444", boxShadow: "0 0 0 2px white" }}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] sm:text-[11px] font-display font-bold leading-none"
                style={{ color: isActive ? "var(--tv-accent, #6366F1)" : "#9CA3AF" }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
