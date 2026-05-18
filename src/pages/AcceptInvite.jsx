// /aceitar-convite?token=XXX — landing pra aceitar convite de viagem.
//
// Estados:
//   - Não logado → redireciona pra /welcome?invite=token (Welcome guarda
//     o token, faz login/signup, e ao voltar logado já cai aqui de novo)
//   - Logado → chama RPC accept_invite(token)
//     - ok=true   → redireciona pra /v/${slug}
//     - ok=false  → mostra mensagem amigável conforme motivo
//   - Sem token na URL → fallback de erro

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import Logo from "../components/Logo";

// Mapa motivo → mensagem pro usuário. Conserva o motivo no console
// pra debug, mas mostra texto humano na UI.
const MOTIVO_MSG = {
  not_found: "Esse convite não existe ou foi revogado.",
  already_accepted: "Esse convite já foi usado.",
  expired: "Esse convite expirou. Peça um novo pro organizador.",
  email_mismatch: "Esse convite foi enviado pra outro email. Entra com a conta certa.",
  plan_limit_reached: "A viagem atingiu o limite de pessoas. Peça pro organizador liberar uma vaga.",
  no_email: "Não consegui ler seu email. Faz login de novo.",
};

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState("idle"); // idle | running | ok | fail
  const [motivo, setMotivo] = useState(null);
  const [slug, setSlug] = useState(null);

  const token = params.get("token");

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setStatus("fail");
      setMotivo("not_found");
      return;
    }
    // Sem login → manda pro Welcome com hint do invite. Welcome guarda
    // ?invite= no localStorage durante o signIn/signUp e redireciona
    // pra cá quando o user voltar logado.
    if (!user) {
      navigate(`/welcome?invite=${encodeURIComponent(token)}`, { replace: true });
      return;
    }
    // Logado: roda a RPC uma única vez.
    if (status !== "idle") return;
    setStatus("running");
    (async () => {
      const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
      if (error) {
        console.error("[accept-invite] RPC erro:", error);
        setStatus("fail");
        setMotivo("error");
        return;
      }
      if (data?.ok && data?.slug) {
        setStatus("ok");
        setSlug(data.slug);
        // Pequeno delay pra mostrar feedback visual antes de redirecionar.
        setTimeout(() => navigate(`/v/${data.slug}`, { replace: true }), 1200);
      } else {
        setStatus("fail");
        setMotivo(data?.motivo ?? "unknown");
      }
    })();
  }, [authLoading, user, token, status, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-app p-6 text-center">
      <Logo className="w-32 mb-8" />
      <div className="card max-w-md w-full p-6">
        {(status === "idle" || status === "running" || authLoading) && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--tv-accent)" }} />
            <div className="text-[#374151] text-sm">Conferindo seu convite…</div>
          </div>
        )}
        {status === "ok" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <div className="font-display font-extrabold text-xl text-[#0F172A]">
              Tudo certo!
            </div>
            <div className="text-[#374151] text-sm">
              Você entrou na viagem. Te levando lá…
            </div>
            {slug && (
              <Link
                to={`/v/${slug}`}
                replace
                className="btn-primary inline-flex items-center gap-1.5 mt-2"
              >
                Abrir viagem <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        )}
        {status === "fail" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <AlertCircle className="w-12 h-12 text-amber-500" />
            <div className="font-display font-extrabold text-xl text-[#0F172A]">
              Convite não aceito
            </div>
            <div className="text-[#374151] text-sm">
              {MOTIVO_MSG[motivo] ?? "Algo deu errado. Tenta de novo daqui a pouco."}
            </div>
            <Link to="/" className="btn-ghost mt-2">Voltar pra home</Link>
          </div>
        )}
      </div>
    </div>
  );
}
