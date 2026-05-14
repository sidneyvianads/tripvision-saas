import { useEffect, useState } from "react";
import { X, Sparkles, Loader2, Star, Check, Gift } from "lucide-react";
import { PLANS, PRICES, monthlyEquivalent, TRIAL_DAYS } from "../data/plans";
import { supabase } from "../lib/supabase";

export default function UpgradeModal({ open, onClose, reason = "ia", user }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [ciclo, setCiclo] = useState("anual");
  const [refAfiliado, setRefAfiliado] = useState(null);

  // Pega o afiliado de quem indicou esse user (lookup transparente — sem digitação).
  // O upgrade flow não pode atribuir afiliado novo; só preserva o original do cadastro.
  useEffect(() => {
    if (!open || !user?.afiliado_id) { setRefAfiliado(null); return; }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("afiliados")
        .select("id, nome, cupom, desconto_percent")
        .eq("id", user.afiliado_id)
        .eq("ativo", true)
        .maybeSingle();
      if (active) setRefAfiliado(data ?? null);
    })();
    return () => { active = false; };
  }, [open, user?.afiliado_id]);

  if (!open) return null;

  const heading = (
    {
      ia:           "✨ Libere o Jei sem limites",
      viagens:      "📁 Mais viagens, menos limite",
      chat:         "💬 Chat do grupo é Pro",
      admin:        "🛡️ Painel admin é Pro",
      checklist:    "✅ Checklist ilimitado",
      membros:      "👥 Mais pessoas no grupo",
      compartilhar: "🔗 Compartilhar viagem é Pro",
      pesquisa:     "🔍 Pesquisa de preços é Pro",
    }[reason]
  ) ?? "✨ Libere o Jei sem limites";

  const desc = (
    {
      ia:           "Comece o teste grátis de 7 dias pra liberar o Jei sem limites.",
      viagens:      "Pro: até 3 viagens. Grupo: até 5. Teste grátis por 7 dias.",
      chat:         "Chat do grupo está no Pro. Teste grátis por 7 dias.",
      admin:        "Edição manual do roteiro está no Pro. Teste grátis por 7 dias.",
      checklist:    "Checklist ilimitado no Pro e Grupo. Teste grátis por 7 dias.",
      membros:      "Pro: até 5 pessoas. Grupo: até 20. Teste grátis por 7 dias.",
      compartilhar: "Compartilhar a viagem está no Pro. Teste grátis por 7 dias.",
      pesquisa:     "Pesquisa de preços reais está no Pro. Teste grátis por 7 dias.",
      expirado:     "Seu acesso expirou. Reative pra continuar planejando — 7 dias grátis pra recomeçar.",
    }[reason]
  ) ?? "Comece o teste grátis de 7 dias.";

  const handleAssinar = async (plano) => {
    setErr(null);
    setInfo(null);
    setBusy(plano);
    try {
      // Reaplica o cupom do afiliado original do usuário (se existir + ainda ativo).
      const cupom = refAfiliado?.cupom ?? null;
      const res = await fetch("/api/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plano,
          ciclo,
          userId: user?.id,
          userEmail: user?.email,
          cupom,
        }),
      });
      const data = await res.json();
      if (res.status === 503 && data?.placeholder) {
        setInfo("Pagamento será habilitado em breve! 💌 Entre em contato em sidney@grupomultvision.com pra liberar manualmente.");
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data?.init_point) {
        window.location.href = data.init_point;
        return;
      }
      throw new Error("Resposta sem URL de pagamento.");
    } catch (e) {
      console.error("[Upgrade] erro:", e);
      setErr(e.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 animate-fade-up"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl sm:mx-4 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col animate-pop bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white px-4 py-3 flex items-center gap-2" style={{ background: "var(--tv-gradient, linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%))" }}>
          <Sparkles className="w-5 h-5 shrink-0" />
          <div className="font-display font-extrabold flex-1">{heading}</div>
          <button onClick={onClose} className="p-1 rounded-full bg-white/15 hover:bg-white/25" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm text-[#374151]">{desc}</p>

          <div className="mt-3 flex justify-center">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest uppercase"
              style={{ background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}
            >
              <Gift className="w-3 h-3" /> {TRIAL_DAYS} dias grátis — cancele quando quiser
            </span>
          </div>

          <div className="mt-4">
            <CycleToggleModal ciclo={ciclo} setCiclo={setCiclo} />
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <UpgradeCard
              plan={PLANS.pro}
              ciclo={ciclo}
              onAssinar={() => handleAssinar("pro")}
              busy={busy === "pro"}
              accent="#8B5CF6"
              highlight
              badge="MAIS POPULAR"
            />
            <UpgradeCard
              plan={PLANS.grupo}
              ciclo={ciclo}
              onAssinar={() => handleAssinar("grupo")}
              busy={busy === "grupo"}
              accent="#F59E0B"
            />
          </div>

          {refAfiliado && (
            <div
              className="mt-4 rounded-xl px-3 py-2 text-[12px] font-display font-bold flex items-center gap-2"
              style={{ background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}
            >
              <span className="text-base">🎟️</span>
              <span className="flex-1">
                Indicado por <strong>{refAfiliado.nome}</strong>
                {Number(refAfiliado.desconto_percent) > 0 && (
                  <> — <strong>{Number(refAfiliado.desconto_percent).toFixed(0)}% off no 1º mês</strong></>
                )}
              </span>
            </div>
          )}

          {info && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900 text-sm">{info}</div>
          )}
          {err && (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">{err}</div>
          )}
          {busy && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[#6B7280] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Redirecionando pro pagamento…
            </div>
          )}

          <p className="text-center text-[11px] text-[#9CA3AF] mt-5">
            Pagamento via Mercado Pago. Sem cobrança nos primeiros {TRIAL_DAYS} dias.
          </p>

          <div className="text-center mt-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[#6B7280] hover:underline font-display font-bold"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CycleToggleModal({ ciclo, setCiclo }) {
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

function UpgradeCard({ plan, ciclo, onAssinar, busy, accent, highlight, badge }) {
  const price = PRICES[plan.id]?.[ciclo];
  if (!price) return null;
  const monthlyEq = monthlyEquivalent(plan.id, ciclo);
  const isAnual = ciclo === "anual";
  const strike = isAnual ? PRICES[plan.id].mensal.amount * 12 : null;
  const Icon = plan.id === "grupo" ? Star : Sparkles;
  return (
    <div
      className="rounded-2xl p-4 flex flex-col relative bg-white"
      style={{
        border: highlight ? `2px solid ${accent}` : "1px solid #E5E7EB",
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
      <div className="flex items-center gap-2">
        <span className="text-xl">{plan.icon}</span>
        <span className="font-display font-extrabold text-[#1F2937] text-lg">{plan.nome}</span>
      </div>

      <div className="mt-2">
        <div className="flex items-baseline gap-1">
          <span className="font-display font-extrabold text-4xl text-[#0F172A] tabular leading-none">
            R$ {formatPrice(monthlyEq)}
          </span>
          <span className="text-[13px] font-bold text-[#64748B]">/mês</span>
        </div>
        <div className="text-[12px] text-[#64748B] mt-1">
          {isAnual
            ? <>cobrado <strong className="text-[#0F172A]">R$ {formatPrice(price.amount)}/ano</strong></>
            : "cobrado mensalmente"}
        </div>
        {isAnual && (
          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-display font-extrabold text-white" style={{ background: "#10B981" }}>
            economize 33% vs mensal
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-1 flex-1">
        {plan.features.slice(0, 5).map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[12px] text-[#374151]">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onAssinar}
        disabled={busy}
        className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-display font-extrabold text-white w-full disabled:opacity-60"
        style={{ background: "#F97316" }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
        Começar teste grátis →
      </button>
    </div>
  );
}

function formatPrice(n) {
  return n.toFixed(2).replace(".", ",");
}
