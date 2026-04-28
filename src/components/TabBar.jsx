import { CalendarDays, MessageCircle, Bot, CheckSquare } from "lucide-react";

const TABS = [
  { id: "roteiro", label: "Roteiro", Icon: CalendarDays },
  { id: "chat",    label: "Chat",    Icon: MessageCircle },
  { id: "ia",      label: "IA",      Icon: Bot },
  { id: "tarefas", label: "Tarefas", Icon: CheckSquare },
];

export default function TabBar({ active, onChange }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 safe-bottom"
      style={{
        background: "linear-gradient(180deg, #0D1B2A 0%, #0A1320 100%)",
        borderTop: "1px solid rgba(124, 185, 232, 0.18)",
        boxShadow: "0 -6px 28px rgba(0, 0, 0, 0.30)",
      }}
    >
      <div className="max-w-2xl mx-auto grid grid-cols-4">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center justify-center gap-1 py-2.5 transition-colors"
              aria-label={label}
            >
              <Icon
                className="w-5 h-5"
                style={{ color: isActive ? "#7CB9E8" : "rgba(232, 240, 254, 0.45)" }}
                strokeWidth={isActive ? 2.5 : 2}
                fill={isActive ? "rgba(124, 185, 232, 0.20)" : "none"}
              />
              <span
                className="text-[11px] font-display font-bold"
                style={{ color: isActive ? "#7CB9E8" : "rgba(232, 240, 254, 0.45)" }}
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
