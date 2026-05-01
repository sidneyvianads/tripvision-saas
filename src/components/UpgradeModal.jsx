import { useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import { PLANS, PRICES } from "../data/plans";

export default function UpgradeModal({
  open,
  onClose,
  reason = "ia",
  user,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);

  if (!open) return null;

  const heading = (
    {
      ia:           "✨ Libere o poder da IA",
      viagens:      "📁 Mais viagens, menos limite",
      chat:         "💬 Chat do grupo é Pro",
      admin:        "🛡️ Painel admin é Pro",
      checklist:    "✅ Checklist ilimitado",
      membros:      "👥 Mais pessoas no grupo",
      compartilhar: "🔗 Compartilhar viagem é Pro",
      pesquisa:     "🔍 Pesquisa online é Pro",
    }[reason]
  ) ?? "✨ Libere o TripVision Pro";

  const desc = (
    {
      ia:           "Suas mensagens gratuitas acabaram. Assina o Pro pra planejamento ilimitado com pesquisa online em tempo real.",
      viagens:      "O Free permite 1 viagem ativa. Assina o Pro pra criar até 3.",
      chat:         "O chat do grupo está disponível no Pro. Conversa com a galera sem sair do app.",
      admin:        "Edição manual fina do roteiro está no Pro. Combine com a IA pra ajustar detalhes.",
      checklist:    "O Free permite 5 itens. No Pro é ilimitado.",
      membros:      "O Free é só pra você. Pro permite até 5 pessoas no grupo.",
      compartilhar: "Compartilhar a viagem com o grupo é exclusivo do Pro. Mande o link pra quem vai junto e todos veem o roteiro pelo app.",
      pesquisa:     "A pesquisa online em tempo real (preços, hotéis, restaurantes atualizados) é exclusiva do Pro. Free só conversa com a IA sem pesquisa.",
    }[reason]
  ) ?? "Veja o plano Pro e libere todos os recursos.";

  const handleAssinar = async (plano, ciclo) => {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await fetch("/api/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plano,
          ciclo,
          userId: user?.id,
          userEmail: user?.email,
        }),
      });
      const data = await res.json();
      if (res.status === 503 && data?.placeholder) {
        setInfo("Pagamento será habilitado em breve! 💌 Entra em contato em sidney@grupomultvision.com pra liberar o Pro manualmente.");
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
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 animate-fade-up"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg sm:mx-4 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col animate-pop"
        style={{ background: "linear-gradient(180deg, #E8F0FE 0%, #FFFFFF 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gradient-primary text-white px-4 py-3 flex items-center gap-2">
          <div className="text-xl">✨</div>
          <div className="flex-1">
            <div className="font-display font-extrabold leading-tight">{heading}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full bg-white/15 hover:bg-white/25" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm text-[#1A3A4A]">{desc}</p>

          <div className="mt-5">
            <PlanQuick plan={PLANS.pro} priceM={PRICES.pro.mensal} priceA={PRICES.pro.anual} onAssinar={handleAssinar} disabled={busy} highlight />
          </div>

          {info && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900 text-sm">
              {info}
            </div>
          )}
          {err && (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
              {err}
            </div>
          )}

          {busy && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[#1A3A4A]/70 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Redirecionando pro pagamento…
            </div>
          )}

          <p className="text-center text-[11px] text-[#1A3A4A]/55 mt-5">
            Pagamento via Mercado Pago. Cancele a qualquer momento. Sem letra miúda.
          </p>

          <div className="text-center mt-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[#7CB9E8] hover:underline font-display font-bold"
            >
              Continuar no Free
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanQuick({ plan, priceM, priceA, onAssinar, disabled, highlight }) {
  const [ciclo, setCiclo] = useState("anual");
  const price = ciclo === "anual" ? priceA : priceM;
  return (
    <div
      className="rounded-2xl p-4 flex flex-col"
      style={{
        background: highlight
          ? "linear-gradient(180deg, rgba(212, 165, 116, 0.10), rgba(232, 131, 74, 0.06))"
          : "rgba(124, 185, 232, 0.06)",
        border: highlight ? "1.5px solid #D4A574" : "1.5px solid rgba(124, 185, 232, 0.35)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{plan.icon}</span>
        <span className="font-display font-extrabold text-[#0F1B2D]">{plan.nome}</span>
        {highlight && (
          <span className="badge ml-auto" style={{ background: "#D4A574", color: "#0F1B2D" }}>+ POPULAR</span>
        )}
      </div>

      <div className="mt-2 inline-flex p-0.5 rounded-full self-start text-[10px] font-display font-extrabold uppercase" style={{ background: "rgba(15,27,45,0.06)" }}>
        {["mensal", "anual"].map((c) => (
          <button
            key={c}
            onClick={() => setCiclo(c)}
            className="px-2 py-0.5 rounded-full transition"
            style={{
              background: ciclo === c ? "#0F1B2D" : "transparent",
              color: ciclo === c ? "#E8F0FE" : "#1A3A4A",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-2">
        <div className="font-display font-extrabold text-2xl text-[#0F1B2D] tabular">
          {price.display.replace(/\/(mês|ano)/, "")}
        </div>
        <div className="text-[11px] text-[#1A3A4A]/65">
          /{ciclo === "anual" ? "ano (economize 33%)" : "mês"}
        </div>
      </div>

      <button
        onClick={() => onAssinar(plan.id, ciclo)}
        disabled={disabled}
        className="mt-3 w-full px-3 py-2 rounded-xl font-display font-extrabold text-sm text-white disabled:opacity-50"
        style={{
          background: highlight
            ? "linear-gradient(135deg, #E8834A 0%, #D4A574 100%)"
            : "linear-gradient(135deg, #7CB9E8 0%, #2E86C1 100%)",
          boxShadow: "0 4px 16px rgba(15, 27, 45, 0.18)",
        }}
      >
        Assinar {plan.nome}
      </button>
    </div>
  );
}
