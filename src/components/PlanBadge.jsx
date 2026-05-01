import { PLANS } from "../data/plans";

export default function PlanBadge({ plano, size = "sm", showFree = false }) {
  if (!plano) return null;
  if (plano === "free" && !showFree) return null;
  const data = PLANS[plano];
  if (!data) return null;

  const isSm = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-display font-extrabold tracking-wide ${isSm ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"}`}
      style={{
        background: data.cor + "33",
        color: data.cor,
        border: `1px solid ${data.cor}66`,
      }}
      title={`Plano ${data.nome}`}
    >
      <span>{data.icon}</span>
      <span>{data.nome.toUpperCase()}</span>
    </span>
  );
}
