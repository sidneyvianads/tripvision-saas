import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Check, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { isPaid, planName } from "../data/plans";
import Snow from "../components/ambient/Snow";

const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 90_000;

export default function AssinaturaSucesso() {
  const { user } = useAuth();
  const [planoAtual, setPlanoAtual] = useState(user?.plano ?? "free");
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    if (isPaid(planoAtual)) { setDone(true); return; }

    let active = true;
    const start = Date.now();

    const poll = async () => {
      const { data } = await supabase
        .from("users")
        .select("plano")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      if (data?.plano && data.plano !== planoAtual) {
        setPlanoAtual(data.plano);
        if (isPaid(data.plano)) { setDone(true); return; }
      }
      setTries((t) => t + 1);
      if (Date.now() - start < POLL_TIMEOUT) {
        setTimeout(poll, POLL_INTERVAL);
      }
    };
    setTimeout(poll, POLL_INTERVAL);
    return () => { active = false; };
  }, [user?.id, planoAtual]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gradient-night relative overflow-hidden p-4">
      <Snow count={70} />
      <div className="relative z-10 card max-w-md w-full p-8 text-center animate-fade-up">
        {done ? (
          <>
            <div className="text-6xl mb-3 animate-pop">🎉</div>
            <h1 className="text-3xl font-display font-extrabold text-[#0F1B2D]">
              Bem-vindo ao TripVision <span className="text-[#D4A574]">{planName(planoAtual)}</span> {planoAtual === "pro" ? "✨" : "⭐"}
            </h1>
            <p className="text-[#1A3A4A]/75 mt-2 text-sm">
              Sua assinatura está ativa. Agora a IA pesquisa, sugere e monta o roteiro sem limites.
            </p>
            <Link
              to="/"
              className="btn-primary mt-6 w-full inline-flex items-center justify-center gap-2"
            >
              Ir pra Minhas Viagens <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        ) : (
          <>
            <div className="text-6xl mb-3">⏳</div>
            <h1 className="text-2xl font-display font-extrabold text-[#0F1B2D]">
              Estamos confirmando seu pagamento…
            </h1>
            <p className="text-[#1A3A4A]/75 mt-2 text-sm">
              Isso pode levar alguns segundos. Vamos atualizar automaticamente assim que o Mercado Pago confirmar.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-[#7CB9E8] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="tabular">Tentativa {tries + 1}…</span>
            </div>
            <Link
              to="/"
              className="block mt-6 text-sm text-[#2E86C1] hover:underline font-display font-bold"
            >
              Continuar sem esperar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
