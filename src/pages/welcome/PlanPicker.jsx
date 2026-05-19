// R29-3: extraído do Welcome.jsx.
//
// Etapa 3 do signup: usuário escolhe plano (Pro ou Grupo) e ciclo
// (Mensal com trial / Anual com desconto). Aplica % de desconto do
// cupom de afiliado, se houver.
//
// API:
//   <PlanPicker afiliado={...} onChoose={(planId, ciclo) => ...} onBack={fn} loading={bool} err={string} />

import { useState } from "react";
import { Sparkles, Star, Gift, Check, Loader2 } from "lucide-react";
import { PLANS, PRICES, monthlyEquivalent, TRIAL_DAYS } from "../../data/plans";
import { StepIndicator, round2, formatPrice } from "./_shared";

export default function PlanPicker({ afiliado, onChoose, onBack, loading, err }) {
  const [ciclo, setCiclo] = useState("anual");
  const pro = PLANS.pro;
  const grupo = PLANS.grupo;
  const desconto = Number(afiliado?.desconto_percent ?? 0);

  return (
    <div className="mt-6 space-y-3 animate-pop">
      <StepIndicator step={3} />

      <div className="text-center">
        {ciclo === "mensal" ? (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest uppercase"
            style={{ background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}
          >
            <Gift className="w-3 h-3" /> {TRIAL_DAYS} dias grátis — cancele quando quiser
          </div>
        ) : (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest uppercase"
            style={{ background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}
          >
            <Sparkles className="w-3 h-3" /> Anual — economize 33% vs mensal
          </div>
        )}
        <h2 className="font-display font-extrabold text-[#1F2937] text-xl mt-3">Escolha seu plano</h2>
        <p className="text-[#6B7280] text-xs mt-1">
          {ciclo === "mensal"
            ? `Não cobramos nada nos primeiros ${TRIAL_DAYS} dias. Cancele a qualquer momento.`
            : "Cobrança única, válida por 12 meses. Cancele a qualquer momento."}
        </p>
      </div>

      {/* Badge cupom aplicado */}
      {afiliado && desconto > 0 && (
        <div
          className="rounded-xl px-3 py-2 text-[12px] font-display font-bold flex items-center gap-2"
          style={{ background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}
        >
          <span className="text-base">🎟️</span>
          <span className="flex-1">
            Cupom <strong>{afiliado.cupom}</strong> aplicado — <strong>{desconto.toFixed(0)}% off no 1º mês</strong>
          </span>
        </div>
      )}
      {afiliado && desconto === 0 && (
        <div
          className="rounded-xl px-3 py-2 text-[12px] font-display font-bold flex items-center gap-2"
          style={{ background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}
        >
          <span className="text-base">🎟️</span>
          <span className="flex-1">Indicado por <strong>{afiliado.nome}</strong></span>
        </div>
      )}

      <CycleToggle ciclo={ciclo} setCiclo={setCiclo} />

      <PlanCard
        plan={pro}
        ciclo={ciclo}
        desconto={desconto}
        badge="MAIS POPULAR"
        bullets={[
          "Até 3 viagens",
          "500 mensagens por mês",
          "Compartilhar com 5 pessoas",
          "Chat do grupo (atualiza na hora)",
          "Pesquisa preços reais",
        ]}
        ctaIcon={Sparkles}
        accent="#F97316"
        onClick={() => onChoose("pro", ciclo)}
        disabled={loading}
        highlight
      />

      <PlanCard
        plan={grupo}
        ciclo={ciclo}
        desconto={desconto}
        bullets={[
          "Até 5 viagens",
          "2.000 mensagens por mês",
          "Compartilhar com 20 pessoas",
          "Chat do grupo",
          "Tudo do Pro + escala maior",
        ]}
        ctaIcon={Star}
        accent="#F59E0B"
        onClick={() => onChoose("grupo", ciclo)}
        disabled={loading}
      />

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-700 text-sm">{err}</div>
      )}

      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="text-sm text-[#64748B] hover:text-[#0F172A] font-display font-bold w-full text-center disabled:opacity-50 pt-1"
      >
        ← Voltar
      </button>

      <p className="text-center text-[11px] text-[#94A3B8] pt-1">
        Pagamento via Mercado Pago.{" "}
        {ciclo === "mensal" ? `Sem cobrança nos primeiros ${TRIAL_DAYS} dias.` : "Cancele a qualquer momento."}
      </p>
    </div>
  );
}

function CycleToggle({ ciclo, setCiclo }) {
  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex p-1 rounded-full" style={{ background: "#F3F4F6" }}>
        {[
          { id: "mensal", label: "Mensal" },
          { id: "anual",  label: "Anual" },
        ].map((opt) => {
          const active = ciclo === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setCiclo(opt.id)}
              className="px-4 py-1.5 rounded-full text-[12px] font-display font-extrabold transition-all flex items-center gap-1.5"
              style={{
                background: active ? "#FFFFFF" : "transparent",
                color: active ? "#1F2937" : "#6B7280",
                boxShadow: active ? "0 2px 6px rgba(15,23,42,0.08)" : "none",
              }}
            >
              {opt.label}
              {opt.id === "anual" && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white" style={{ background: "#10B981" }}>
                  -33%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanCard({
  plan, ciclo, desconto, badge, bullets,
  ctaIcon: CtaIcon, accent, onClick, disabled, highlight,
}) {
  const isAnual = ciclo === "anual";
  const price = PRICES[plan.id]?.[ciclo];
  const monthlyEq = monthlyEquivalent(plan.id, ciclo);
  const hasDesconto = desconto > 0;
  const discounted = hasDesconto ? round2(monthlyEq * (1 - desconto / 100)) : null;

  return (
    <div
      className="w-full p-4 rounded-2xl relative bg-white"
      style={{
        border: highlight ? `2px solid ${accent}` : "1px solid #E2E8F0",
        boxShadow: highlight ? `0 8px 24px ${accent}33` : "0 1px 3px rgba(15,23,42,0.06)",
      }}
    >
      {badge && (
        <span
          className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] font-display font-extrabold tracking-widest text-white"
          style={{ background: accent }}
        >
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xl">{plan.icon}</span>
        <span className="font-display font-extrabold text-[#0F172A]">{plan.nome}</span>
      </div>

      <div className="mt-2">
        {hasDesconto ? (
          <>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-display font-bold text-base text-[#94A3B8] line-through tabular">
                R$ {formatPrice(monthlyEq)}
              </span>
              <span className="font-display font-extrabold text-4xl text-[#0F172A] tabular leading-none">
                R$ {formatPrice(discounted)}
              </span>
              <span className="text-[13px] font-bold text-[#64748B]">/1º mês</span>
            </div>
            <div className="text-[12px] text-[#9A3412] font-display font-bold mt-1">
              {desconto.toFixed(0)}% off com o cupom 🎉
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              Depois: R$ {formatPrice(monthlyEq)}/mês{isAnual ? ` (R$ ${formatPrice(price.amount)}/ano)` : ""}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="font-display font-extrabold text-4xl text-[#0F172A] tabular leading-none">
                R$ {formatPrice(monthlyEq)}
              </span>
              <span className="text-[13px] font-bold text-[#64748B]">/mês</span>
            </div>
            <div className="text-[12px] text-[#64748B] mt-1">
              {isAnual
                ? <>cobrança única: <strong className="text-[#0F172A]">R$ {formatPrice(price.amount)}/ano</strong></>
                : "cobrado mensalmente após o trial de 7 dias"}
            </div>
            {isAnual && (
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-display font-extrabold text-white" style={{ background: "#10B981" }}>
                economize 33% vs mensal
              </span>
            )}
          </>
        )}
      </div>

      <ul className="mt-3 space-y-0.5">
        {bullets.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[12px] text-[#374151]">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-3 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-display font-extrabold text-white w-full disabled:opacity-60"
        style={{ background: "#F97316" }}
      >
        {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <CtaIcon className="w-4 h-4" />}
        {isAnual ? "Assinar anual →" : "Começar teste grátis →"}
      </button>
    </div>
  );
}
