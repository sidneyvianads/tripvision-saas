import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Sparkles, ExternalLink, AlertCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { PLANS, planName, planIcon, isPaid } from "../data/plans";
import UpgradeModal from "../components/UpgradeModal";
import Avatar from "../components/Avatar";
import Mountains from "../components/ambient/Mountains";

const formatBR = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return null; }
};

export default function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [assinatura, setAssinatura] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(params.get("upgrade") != null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("assinaturas")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["active", "pending", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setAssinatura(data);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  if (!user) return null;
  const plano = user.plano ?? "free";
  const planoData = PLANS[plano];
  const isFree = !isPaid(plano);

  return (
    <div className="min-h-screen flex flex-col gradient-winter">
      <header className="gradient-header text-white safe-top relative overflow-hidden">
        <Mountains className="h-16" color="#7CB9E8" />
        <div className="px-4 pt-4 pb-5 flex items-center gap-3 relative z-10">
          <Link to="/" className="rounded-full bg-white/15 hover:bg-white/25 p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-lg leading-tight">Minha conta</div>
            <div className="text-[#7CB9E8] text-xs truncate">{user.email}</div>
          </div>
          <Avatar user={user} size={36} style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.45)" }} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-12 max-w-2xl mx-auto w-full">
        {/* Card de plano */}
        <section className="card p-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{planoIcon(plano)}</span>
            <span className="font-display font-extrabold text-xl text-[#0F1B2D]">Plano {planName(plano)}</span>
            {!isFree && (
              <span
                className="badge ml-auto"
                style={{ background: planoData?.cor + "33", color: planoData?.cor }}
              >
                ATIVO
              </span>
            )}
          </div>
          <p className="text-[13px] text-[#1A3A4A]/75 mt-1">{planoData?.tagline ?? ""}</p>

          {!isFree && assinatura && (
            <div className="mt-3 text-[13px] text-[#1A3A4A]/85 space-y-1">
              <div>Ciclo: <strong>{assinatura.ciclo === "anual" ? "Anual" : "Mensal"}</strong></div>
              {assinatura.current_period_end && (
                <div>Próxima cobrança: <strong>{formatBR(assinatura.current_period_end)}</strong></div>
              )}
              {assinatura.amount && (
                <div>Valor: <strong>R$ {Number(assinatura.amount).toFixed(2).replace(".", ",")}</strong></div>
              )}
            </div>
          )}

          {!isFree && (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="https://www.mercadopago.com.br/subscriptions"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-display font-bold border-2"
                style={{ borderColor: "#7CB9E8", color: "#1A3A4A" }}
              >
                Gerenciar no Mercado Pago <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setShowUpgrade(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-display font-bold"
                style={{ background: "rgba(124, 185, 232, 0.15)", color: "#1A3A4A" }}
              >
                Trocar plano
              </button>
            </div>
          )}

          {isFree && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Assinar Pro
            </button>
          )}
        </section>

        {/* Features incluídas */}
        <section className="card p-5 mt-3">
          <div className="font-display font-extrabold text-[#0F1B2D]">O que está incluído</div>
          <ul className="mt-2 space-y-1 text-[13px] text-[#1A3A4A]">
            {(planoData?.features ?? []).map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Conta */}
        <section className="card p-5 mt-3">
          <div className="font-display font-extrabold text-[#0F1B2D]">Sua conta</div>
          <div className="text-[13px] text-[#1A3A4A]/85 mt-2 space-y-1">
            <div>Nome: <strong>{user.nome}</strong></div>
            <div>E-mail: <strong>{user.email}</strong></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (!confirm("Sair? Sua sessão será encerrada nesse navegador.")) return;
                signOut();
                navigate("/");
              }}
              className="text-sm text-red-600 hover:underline font-display font-bold"
            >
              Sair da conta
            </button>
          </div>
        </section>

        <section className="card p-5 mt-3 text-[12px] text-[#1A3A4A]/70 space-y-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Dúvidas ou cancelamento? Escreva pra <a href="mailto:sidney@grupomultvision.com" className="text-[#2E86C1] underline">sidney@grupomultvision.com</a>
          </div>
        </section>
      </main>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="upgrade"
        user={user}
      />
    </div>
  );
}

function planoIcon(p) { return planIcon(p); }
