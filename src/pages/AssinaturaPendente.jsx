// R31-C: tela pra quem está logado mas sem plano ativo. PaywallGate
// redireciona aqui. O user pode escolher plano + ciclo (reutiliza
// PlanPicker do flow de signup) e disparar checkout do MP. Não permite
// acesso ao app até webhook confirmar pagamento.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { startCheckoutSession } from "../lib/checkout";
import { friendlyError } from "../lib/errorMessages";
import { hasActiveAccess } from "../data/plans";
import { trackPaymentStarted } from "../lib/analytics";
import { getStoredCupom, clearStoredCupom } from "../lib/cupom";
import { clearStoredOrigem } from "../lib/origem";
import PlanPicker from "./welcome/PlanPicker";
import Logo from "../components/Logo";

export default function AssinaturaPendente() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // R31-D: se o webhook ativou o plano enquanto o user estava aqui (ex:
  // voltou da janela do MP), libera direto pra "/" em vez de manter ele
  // preso na tela de paywall.
  useEffect(() => {
    if (user && hasActiveAccess(user)) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const handleChoose = async (plano, ciclo) => {
    if (!user?.id) return;
    setErr(null);
    setBusy(true);
    try {
      const cupom = getStoredCupom() || null;
      const { data: { session } } = await supabase.auth.getSession();
      const result = await startCheckoutSession({
        plano, ciclo, cupom, accessToken: session?.access_token,
      });
      if (result.placeholder) {
        setErr("Pagamento ainda em configuração. Escreve pra sidney@grupomultvision.com pra liberar manualmente.");
        setBusy(false);
        return;
      }
      clearStoredCupom();
      clearStoredOrigem();
      trackPaymentStarted(plano, ciclo, { user_id: user.id, has_cupom: !!cupom });
      window.location.href = result.init_point;
    } catch (e) {
      console.error("[AssinaturaPendente] checkout falhou:", e);
      setErr(friendlyError(e));
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/welcome", { replace: true });
  };

  if (!user) return null; // PaywallGate só envia logged-in, mas defesa

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-5 py-8" style={{ background: "#F8FAFC" }}>
      <div className="card w-full max-w-md p-8 animate-fade-up">
        <div className="text-center">
          <Link to="/" className="inline-block" aria-label="Viajjei">
            <Logo size={48} />
          </Link>
          <h1 className="font-display font-extrabold text-[#1F2937] text-2xl mt-4">
            Cadastra o pagamento pra entrar
          </h1>
          <p className="text-[#4B5563] text-sm mt-2">
            Sua conta tá pronta, {user.nome?.split(" ")[0] || "viajante"}! Pra liberar o app, escolhe um plano e cadastra o cartão no Mercado Pago. <strong>O trial só começa depois disso.</strong>
          </p>
        </div>

        <div className="mt-2">
          <PlanPicker
            afiliado={null}
            onChoose={handleChoose}
            onBack={handleLogout}
            loading={busy}
            err={err}
          />
        </div>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            className="text-xs font-display font-bold text-[#64748B] hover:text-[#0F172A] inline-flex items-center gap-1 disabled:opacity-50"
          >
            <LogOut className="w-3 h-3" /> Sair e usar outra conta
          </button>
        </div>

        {busy && (
          <div className="mt-4 flex items-center justify-center gap-2 text-[#6366F1] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Abrindo Mercado Pago…</span>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-[#6B7280] mt-6 font-display font-bold tracking-wide flex items-center justify-center gap-3">
        <Link to="/" className="hover:text-primary">Início</Link>
        <span className="opacity-30">·</span>
        <Link to="/precos" className="hover:text-primary">Preços</Link>
        <span className="opacity-30">·</span>
        <Link to="/termos" className="hover:text-primary">Termos</Link>
      </div>
    </div>
  );
}
