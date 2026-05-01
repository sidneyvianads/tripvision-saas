import { useState } from "react";
import { Check, X, Sparkles, Star } from "lucide-react";
import { PLANS, PRICES } from "../data/plans";

export default function PricingSection({ onChoose, currentPlan = null, compact = false }) {
  const [cycle, setCycle] = useState("anual");

  return (
    <section className={`relative ${compact ? "py-4" : "py-14"} px-4`}>
      {!compact && (
        <div className="max-w-3xl mx-auto text-center mb-10">
          <div className="text-xs font-display font-extrabold tracking-widest text-[#7CB9E8] uppercase">
            Preços simples
          </div>
          <h2 className="text-3xl sm:text-4xl text-snow font-display font-extrabold mt-2">
            Comece grátis. Cresça quando quiser.
          </h2>
          <p className="text-[#E8F0FE]/75 mt-3 text-sm sm:text-base">
            Sem letra miúda, sem surpresa. Cancele a qualquer momento.
          </p>
        </div>
      )}

      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center gap-1 p-1 rounded-full" style={{ background: "rgba(124,185,232,0.10)", border: "1px solid rgba(124,185,232,0.25)" }}>
          {["mensal", "anual"].map((c) => {
            const active = cycle === c;
            return (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className="px-4 py-1.5 rounded-full text-xs font-display font-extrabold tracking-wide uppercase transition-all"
                style={{
                  background: active ? "linear-gradient(135deg, #7CB9E8 0%, #2E86C1 100%)" : "transparent",
                  color: active ? "#0F1B2D" : "#E8F0FE",
                  boxShadow: active ? "0 4px 12px rgba(124,185,232,0.30)" : "none",
                }}
              >
                {c === "anual" ? "Anual · -33%" : "Mensal"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
        <PlanCard plan={PLANS.free}  cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} />
        <PlanCard plan={PLANS.pro}   cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} highlight />
        <PlanCard plan={PLANS.grupo} cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} />
      </div>
    </section>
  );
}

function PlanCard({ plan, cycle, onChoose, currentPlan, highlight }) {
  const price = plan.id === "free" ? null : PRICES[plan.id]?.[cycle];
  const isCurrent = currentPlan === plan.id;

  return (
    <div
      className="relative rounded-2xl p-5 flex flex-col h-full"
      style={{
        background: highlight
          ? "linear-gradient(180deg, rgba(232, 240, 254, 0.99) 0%, rgba(212, 165, 116, 0.10) 100%)"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(232, 240, 254, 0.92) 100%)",
        border: highlight ? "2px solid #D4A574" : "1px solid rgba(124, 185, 232, 0.30)",
        boxShadow: highlight
          ? "0 12px 36px rgba(212, 165, 116, 0.30)"
          : "0 4px 16px rgba(15, 27, 45, 0.18)",
      }}
    >
      {plan.badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest"
          style={{ background: "#D4A574", color: "#0F1B2D" }}
        >
          {plan.badge}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-2xl">{plan.icon}</span>
        <span className="font-display font-extrabold text-lg text-[#0F1B2D]">{plan.nome}</span>
      </div>
      <div className="text-[12px] text-[#1A3A4A]/70 mt-0.5">{plan.tagline}</div>

      <div className="mt-4">
        {plan.id === "free" ? (
          <>
            <div className="font-display font-extrabold text-4xl text-[#0F1B2D] tabular">R$ 0</div>
            <div className="text-[12px] text-[#1A3A4A]/60">pra sempre</div>
          </>
        ) : (
          <>
            <div className="font-display font-extrabold text-4xl text-[#0F1B2D] tabular">
              {price.display.replace(/\/(mês|ano)/, "")}
            </div>
            <div className="text-[12px] text-[#1A3A4A]/65">/{price.cycle === "mensal" ? "mês" : "ano"}{cycle === "anual" ? " — economize 33%" : ""}</div>
          </>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 flex-1">
        {plan.features.map((f, i) => (
          <li key={`y-${i}`} className="flex items-start gap-2 text-[13px] text-[#1A3A4A]">
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
            <span>{f}</span>
          </li>
        ))}
        {(plan.excluidos ?? []).map((f, i) => (
          <li key={`n-${i}`} className="flex items-start gap-2 text-[13px] text-[#1A3A4A]/45">
            <X className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="line-through">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {isCurrent ? (
          <button
            disabled
            className="w-full px-4 py-2.5 rounded-xl font-display font-extrabold text-sm bg-emerald-100 text-emerald-700"
          >
            Plano atual
          </button>
        ) : plan.id === "free" ? (
          <button
            onClick={() => onChoose?.(plan.id, cycle)}
            className="w-full px-4 py-2.5 rounded-xl font-display font-extrabold text-sm border-2 transition"
            style={{
              borderColor: "#7CB9E8",
              color: "#1A3A4A",
              background: "rgba(124, 185, 232, 0.08)",
            }}
          >
            Começar grátis
          </button>
        ) : (
          <button
            onClick={() => onChoose?.(plan.id, cycle)}
            className="w-full px-4 py-2.5 rounded-xl font-display font-extrabold text-sm text-white inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
            style={{
              background: highlight
                ? "linear-gradient(135deg, #D4A574 0%, #E8834A 100%)"
                : "linear-gradient(135deg, #7CB9E8 0%, #2E86C1 100%)",
              boxShadow: highlight
                ? "0 4px 16px rgba(232, 131, 74, 0.40)"
                : "0 4px 16px rgba(124, 185, 232, 0.40)",
            }}
          >
            {plan.id === "pro" ? <Sparkles className="w-4 h-4" /> : <Star className="w-4 h-4" />}
            Assinar {plan.nome}
          </button>
        )}
      </div>
    </div>
  );
}
