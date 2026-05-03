import { useState } from "react";
import { Check, X, Sparkles, Star } from "lucide-react";
import { PLANS, PRICES, monthlyEquivalent } from "../data/plans";

export default function PricingSection({ onChoose, currentPlan = null, compact = false }) {
  const [cycle, setCycle] = useState("anual");

  return (
    <section className={`relative ${compact ? "py-4" : "py-14"} px-4`}>
      {!compact && (
        <div className="max-w-3xl mx-auto text-center mb-10">
          <div className="text-xs font-display font-extrabold tracking-widest text-[#6366F1] uppercase">
            Preços simples
          </div>
          <h2 className="text-3xl sm:text-4xl text-[#1F2937] font-display font-extrabold mt-2">
            Comece grátis. Cresça quando quiser.
          </h2>
          <p className="text-[#6B7280] mt-3 text-sm sm:text-base">
            Sem letra miúda, sem surpresa. Cancele a qualquer momento.
          </p>
        </div>
      )}

      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white" style={{ border: "1px solid #E5E7EB" }}>
          {["mensal", "anual"].map((c) => {
            const active = cycle === c;
            return (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className="px-4 py-1.5 rounded-full text-xs font-display font-extrabold tracking-wide uppercase transition-all"
                style={{
                  background: active ? "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" : "transparent",
                  color: active ? "#FFFFFF" : "#6B7280",
                  boxShadow: active ? "0 4px 12px rgba(99, 102, 241, 0.30)" : "none",
                }}
              >
                {c === "anual" ? "Anual · -33%" : "Mensal"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
        <PlanCard plan={PLANS.free}  cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} accent="#6366F1" />
        <PlanCard plan={PLANS.pro}   cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} accent="#8B5CF6" highlight />
        <PlanCard plan={PLANS.grupo} cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} accent="#F59E0B" />
      </div>
    </section>
  );
}

function PlanCard({ plan, cycle, onChoose, currentPlan, highlight, accent }) {
  const price = plan.id === "free" ? null : PRICES[plan.id]?.[cycle];
  const isCurrent = currentPlan === plan.id;
  const isAnual = cycle === "anual";
  const monthlyEq = plan.id !== "free" ? monthlyEquivalent(plan.id, cycle) : null;
  const strikeYear = plan.id !== "free" && isAnual
    ? PRICES[plan.id].mensal.amount * 12
    : null;
  const Icon = plan.id === "grupo" ? Star : Sparkles;

  return (
    <div
      className="relative rounded-2xl p-5 flex flex-col h-full"
      style={{
        background: "#FFFFFF",
        border: highlight ? `2px solid ${accent}` : "1px solid #E5E7EB",
        boxShadow: highlight
          ? `0 12px 36px ${accent}26`
          : "0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.04)",
      }}
    >
      {plan.badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest text-white whitespace-nowrap"
          style={{ background: accent }}
        >
          {plan.badge}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-2xl">{plan.icon}</span>
        <span className="font-display font-extrabold text-lg text-[#1F2937]">{plan.nome}</span>
      </div>
      <div className="text-[12px] text-[#6B7280] mt-0.5">{plan.tagline}</div>

      <div className="mt-4">
        {plan.id === "free" ? (
          <>
            <div className="font-display font-extrabold text-4xl text-[#1F2937] tabular">R$ 0</div>
            <div className="text-[12px] text-[#6B7280]">pra sempre</div>
          </>
        ) : (
          <>
            {strikeYear && (
              <div className="text-[11px] text-[#9CA3AF] line-through tabular">
                R$ {formatPrice(strikeYear)}/ano
              </div>
            )}
            <div className="font-display font-extrabold text-4xl text-[#1F2937] tabular leading-tight">
              R$ {formatPrice(price.amount)}
              <span className="text-[14px] font-bold text-[#6B7280]">/{isAnual ? "ano" : "mês"}</span>
            </div>
            <div className="text-[11px] text-emerald-700 font-display font-bold mt-0.5">
              {isAnual
                ? `equivale a R$ ${formatPrice(monthlyEq)}/mês — economize 33%`
                : "cobrança mensal recorrente"}
            </div>
          </>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 flex-1">
        {plan.features.map((f, i) => (
          <li key={`y-${i}`} className="flex items-start gap-2 text-[13px] text-[#374151]">
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
            <span>{f}</span>
          </li>
        ))}
        {(plan.excluidos ?? []).map((f, i) => (
          <li key={`n-${i}`} className="flex items-start gap-2 text-[13px] text-[#9CA3AF]">
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
            className="w-full px-4 py-2.5 rounded-xl font-display font-extrabold text-sm border-2 transition hover:bg-[#F9FAFB]"
            style={{ borderColor: "#E5E7EB", color: "#1F2937", background: "white" }}
          >
            Começar grátis
          </button>
        ) : (
          <button
            onClick={() => onChoose?.(plan.id, cycle)}
            className="w-full px-4 py-2.5 rounded-xl font-display font-extrabold text-sm text-white inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
            style={{
              background: plan.id === "grupo"
                ? "linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)"
                : "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
              boxShadow: `0 4px 16px ${accent}66`,
            }}
          >
            <Icon className="w-4 h-4" />
            Assinar R$ {formatPrice(price.amount)}{isAnual ? "/ano" : "/mês"}
          </button>
        )}
      </div>
    </div>
  );
}

function formatPrice(n) {
  return n.toFixed(2).replace(".", ",");
}
