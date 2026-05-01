import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { isPaid, planName } from "../data/plans";

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
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-app p-4"
      style={{ background: "radial-gradient(circle at top, rgba(99, 102, 241, 0.08), transparent 50%), #FAFBFC" }}
    >
      <div className="card max-w-md w-full p-8 text-center animate-fade-up">
        {done ? (
          <>
            <div className="text-6xl mb-3 animate-pop">🎉</div>
            <h1 className="text-3xl font-display font-extrabold text-[#1F2937]">
              Bem-vindo ao TripVision <span className="text-[#6366F1]">{planName(planoAtual)}</span> {planoAtual === "pro" ? "✨" : "⭐"}
            </h1>
            <p className="text-[#4B5563] mt-2 text-sm">
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
            <h1 className="text-2xl font-display font-extrabold text-[#1F2937]">
              Estamos confirmando seu pagamento…
            </h1>
            <p className="text-[#4B5563] mt-2 text-sm">
              Isso pode levar alguns segundos. Vamos atualizar automaticamente assim que o Mercado Pago confirmar.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-[#6366F1] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="tabular">Tentativa {tries + 1}…</span>
            </div>
            <Link
              to="/"
              className="block mt-6 text-sm text-[#6366F1] hover:underline font-display font-bold"
            >
              Continuar sem esperar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
