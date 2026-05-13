import { useState } from "react";
import { Check, Sparkles, Star, Gift } from "lucide-react";
import { PLANS, PRICES, monthlyEquivalent, TRIAL_DAYS } from "../data/plans";

export default function PricingSection({ onChoose, currentPlan = null, compact = false }) {
  const [cycle, setCycle] = useState("anual");

  return (
    <section className={`relative ${compact ? "py-4" : "py-14"} px-4`}>
      {!compact && (
        <div className="max-w-3xl mx-auto text-center mb-8">
          <div className="text-xs font-display font-extrabold tracking-widest text-[#6366F1] uppercase">
            Preços simples
          </div>
          <h2 className="text-3xl sm:text-4xl text-[#1F2937] font-display font-extrabold mt-2">
            Teste grátis por {TRIAL_DAYS} dias.
          </h2>
          <p className="text-[#6B7280] mt-3 text-sm sm:text-base">
            Sem cobrança no trial. Cancele a qualquer momento.
          </p>
        </div>
      )}

      <div className="flex justify-center mb-3">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-display font-extrabold tracking-widest uppercase"
          style={{ background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}
        >
          <Gift className="w-3 h-3" /> {TRIAL_DAYS} dias grátis em todos os planos
        </span>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
        <PlanCard plan={PLANS.pro}   cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} accent="#8B5CF6" highlight />
        <PlanCard plan={PLANS.grupo} cycle={cycle} onChoose={onChoose} currentPlan={currentPlan} accent="#F59E0B" />
      </div>
    </section>
  );
}

function PlanCard({ plan, cycle, onChoose, currentPlan, highlight, accent }) {
  const price = PRICES[plan.id]?.[cycle];
  const isCurrent = currentPlan === plan.id;
  const isAnual = cycle === "anual";
  const monthlyEq = monthlyEquivalent(plan.id, cycle);
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
        <div className="flex items-baseline gap-1">
          <span className="font-display font-extrabold text-5xl text-[#0F172A] tabular leading-none">
            R$ {formatPrice(isAnual ? monthlyEq : price.amount)}
          </span>
          <span className="text-[15px] font-bold text-[#64748B]">/mês</span>
        </div>
        <div className="text-[13px] text-[#64748B] mt-1">
          {isAnual
            ? <>cobrado <strong className="text-[#0F172A]">R$ {formatPrice(price.amount)}/ano</strong> após o trial</>
            : "cobrado mensalmente após o trial"}
        </div>
        {isAnual && (
          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-display font-extrabold text-white" style={{ background: "#10B981" }}>
            economize 33% vs mensal
          </span>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 flex-1">
        {plan.features.map((f, i) => (
          <li key={`y-${i}`} className="flex items-start gap-2 text-[13px] text-[#374151]">
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
            <span>{f}</span>
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
            Começar teste grátis →
          </button>
        )}
      </div>
    </div>
  );
}

function formatPrice(n) {
  return n.toFixed(2).replace(".", ",");
}
