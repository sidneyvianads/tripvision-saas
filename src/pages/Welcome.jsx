import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { AVATAR_COLORS } from "../data/types";
import Logo from "../components/Logo";
import { getStoredCupom, setStoredCupom, clearStoredCupom } from "../lib/cupom";
import { resolveOrigemPayload, clearStoredOrigem } from "../lib/origem";
import { supabase } from "../lib/supabase";
import { trackPaymentStarted } from "../lib/analytics";
import { friendlyError } from "../lib/errorMessages";
import { passwordStrength } from "./welcome/_shared";
import InfluencerStep from "./welcome/InfluencerStep";
import PlanPicker from "./welcome/PlanPicker";
import LoginForm from "./welcome/LoginForm";
import ForgotPasswordForm from "./welcome/ForgotPasswordForm";
import ResetPasswordForm from "./welcome/ResetPasswordForm";
import SignupDadosForm from "./welcome/SignupDadosForm";

const REDIRECT_DELAY_MS = 1800;

export default function Welcome() {
  const { signIn, signUp, loading, sendPasswordReset, updatePassword, clearRecovering, isRecovering } = useAuth();
  const [params] = useSearchParams();
  // mode: 'login' | 'signup' | 'forgot' | 'reset'
  // - login/signup: fluxos normais
  // - forgot: form pra pedir reset de senha
  // - reset: form pra setar nova senha (quando volta do email com type=recovery)
  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "login");
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [senha2, setSenha2] = useState("");
  const [cor, setCor] = useState(AVATAR_COLORS[0].color);
  const [photo, setPhoto] = useState(null);

  const [success, setSuccess] = useState(null);
  const [justSignedUpEmail, setJustSignedUpEmail] = useState(null);
  // Quando email confirmation está ON no Supabase, signUp não loga o user;
  // mostramos "verifique seu email" e o user continua o fluxo pelo MP.
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  // R11-3: PASSWORD_RECOVERY listener removido daqui (era duplo com o do
  // useAuth.jsx). O event vinha primeiro pra um dos dois listeners e
  // havia race condition em qual setava o state primeiro. Agora reagimos
  // ao flag `isRecovering` derivado do useAuth (fonte única).
  useEffect(() => {
    if (isRecovering && mode !== "reset") {
      setMode("reset");
      setErr(null);
      setInfo("Defina sua nova senha abaixo.");
    }
  }, [isRecovering, mode]);

  // R14-4: se o user veio de /aceitar-convite?token=X (não-logado, AcceptInvite
  // redirecionou pra cá com ?invite=X), guarda o token em sessionStorage. App.jsx
  // observa o flag de "logado + pending_invite" e redireciona pra /aceitar-convite
  // depois do auth completar. Não chave persistente: sessionStorage morre ao
  // fechar a aba — evita pegar convite velho ao voltar dias depois.
  useEffect(() => {
    const invite = params.get("invite");
    if (!invite) return;
    try { window.sessionStorage.setItem("viajjei:pending_invite", invite); } catch {}
  }, [params]);

  // Sub-etapa do cadastro: 'dados' (1) → 'cupom' (2) → 'plano' (3)
  const [signupStep, setSignupStep] = useState("dados");

  // Influenciador selecionado nessa sessão (objeto afiliado completo)
  const [afiliado, setAfiliado] = useState(null);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      setEmail(success.email);
      setSenha("");
      setSenha2("");
      setNome("");
      setCor(AVATAR_COLORS[0].color);
      setPhoto(null);
      setJustSignedUpEmail(success.email);
      setMode("login");
      setSignupStep("dados");
      setSuccess(null);
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [success]);

  const isBusy = loading || !!success;

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setJustSignedUpEmail(null);
    try {
      await signIn(email, senha);
    } catch (e) {
      console.error("[Welcome] login erro:", e);
      setErr(friendlyError(e));
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    try {
      await sendPasswordReset(email);
      setInfo("Email enviado! Confira sua caixa (e o spam). O link abre o Viajjei e te deixa criar uma senha nova.");
    } catch (e) {
      console.error("[Welcome] forgot erro:", e);
      setErr(friendlyError(e));
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!senha || senha !== senha2) {
      setErr("As senhas não conferem.");
      return;
    }
    try {
      await updatePassword(senha);
      setInfo("Senha atualizada! Redirecionando...");
      setSenha("");
      setSenha2("");
      // Libera o App.jsx pra navegar normalmente — agora que a senha foi
      // trocada, manter a session é seguro e o redirect /welcome→/ pode
      // acontecer. Sem isso, o user ficaria preso no Welcome.
      clearRecovering();
    } catch (e) {
      console.error("[Welcome] reset password erro:", e);
      setErr(friendlyError(e));
    }
  };

  // Etapa 1 → 2. Validação defensiva — o botão do form já fica disabled
  // até nome/email/senha estarem válidos; isso aqui é só salvaguarda.
  const handleSignupNext = (e) => {
    e.preventDefault();
    setErr(null);
    const nomeClean = nome.trim();
    if (!nomeClean) return setErr("Digite seu nome.");
    if (nomeClean.length > 50) return setErr("Nome muito longo (máx 50 caracteres).");
    const forca = passwordStrength(senha);
    if (!forca?.valid) return setErr("Senha muito fraca — use no mínimo 6 caracteres com letras e números.");
    if (senha !== senha2) return setErr("As senhas não conferem.");
    if (!email.trim()) return setErr("Informe seu e-mail.");
    setSignupStep("cupom");
  };

  // Etapa 3: cria a conta e redireciona pro Mercado Pago
  const handleConfirmPlan = async (plano, ciclo = "mensal") => {
    setErr(null);
    try {
      const { origem, afiliado_id } = await resolveOrigemPayload();

      const created = await signUp({
        nome: nome.trim(),
        email,
        senha,
        avatar_cor: cor,
        avatar_url: photo,
        origem,
        afiliado_id,
      });

      // Se Supabase tem email confirmation ON, sinaliza pra UI ajustar o toast.
      // O pagamento ainda continua: o webhook MP ativa o plano usando o user_id,
      // independente do email estar confirmado ou não.
      if (created.needsConfirmation) {
        setNeedsConfirmation(true);
      }

      try {
        const cupom = getStoredCupom() || null;
        // Pega session do Supabase (signUp já loga quando email confirmation
        // está OFF). Em caso de confirmation ON, signUp retorna session=null
        // e o flow inteiro precisa esperar confirmação — tratado mais acima
        // via needsConfirmation.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Sessão não disponível — confirme seu email antes de assinar.");
        }
        const res = await fetch("/api/create-subscription", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ plano, ciclo, cupom }),
        });
        const data = await res.json();
        if (res.status === 503 && data?.placeholder) {
          setErr("Pagamento ainda em configuração. Sua conta foi criada — escreva pra sidney@grupomultvision.com pra liberar o acesso manualmente.");
          setSuccess({ email: created.email, nome: created.nome, plano: "pending" });
          return;
        }
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        if (data?.init_point) {
          clearStoredCupom();
          clearStoredOrigem();
          trackPaymentStarted(plano, ciclo, { user_id: created.id, has_cupom: !!cupom });
          window.location.href = data.init_point;
          return;
        }
        throw new Error("Resposta sem URL de pagamento.");
      } catch (e) {
        console.error("[Welcome] checkout failed:", e);
        setErr(`Sua conta foi criada, mas não consegui abrir o pagamento agora. ${friendlyError(e)} Faça login e tente o upgrade pelo painel.`);
        setSuccess({ email: created.email, nome: created.nome, plano: "pending" });
      }
    } catch (e) {
      console.error("[Welcome] signup erro:", e);
      setErr(friendlyError(e));
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-5 py-10 relative overflow-hidden"
      style={{ background: "#F8FAFC" }}
    >
      {success && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white rounded-2xl px-4 py-3 shadow-[0_8px_24px_rgba(46,204,113,0.35)] animate-fade-up flex items-center gap-2 max-w-[92vw]"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="font-display font-bold text-sm">
            {needsConfirmation
              ? "Conta criada! Confira seu email pra confirmar e fazer login."
              : "Conta criada! Redirecionando pro login…"}
          </span>
        </div>
      )}

      <div className="card w-full max-w-md p-8 animate-fade-up relative z-10">
        <div className="text-center">
          <Link to="/" className="inline-block" aria-label="Viajjei">
            <Logo size={56} />
          </Link>
          <p className="text-[#64748B] mt-3 font-display font-bold text-sm">
            Planeje sua viagem conversando com o Jei.
          </p>
        </div>

        {mode === "login" ? (
          <LoginForm
            email={email} setEmail={setEmail}
            senha={senha} setSenha={setSenha}
            loading={loading} err={err} info={info}
            justSignedUpEmail={justSignedUpEmail}
            onSubmit={handleLogin}
            onForgot={() => { setMode("forgot"); setErr(null); setInfo(null); setSenha(""); }}
            onSignup={() => { setMode("signup"); setErr(null); setInfo(null); setJustSignedUpEmail(null); }}
          />
        ) : mode === "forgot" ? (
          <ForgotPasswordForm
            email={email} setEmail={setEmail}
            loading={loading} err={err} info={info}
            onSubmit={handleForgot}
            onBack={() => { setMode("login"); setErr(null); setInfo(null); }}
          />
        ) : mode === "reset" ? (
          <ResetPasswordForm
            senha={senha} setSenha={setSenha}
            senha2={senha2} setSenha2={setSenha2}
            loading={loading} err={err} info={info}
            onSubmit={handleReset}
          />
        ) : signupStep === "plano" ? (
          <PlanPicker
            afiliado={afiliado}
            onChoose={handleConfirmPlan}
            onBack={() => { setSignupStep("cupom"); setErr(null); }}
            loading={isBusy}
            err={err}
          />
        ) : signupStep === "cupom" ? (
          <InfluencerStep
            selected={afiliado}
            onSelect={(af) => { setAfiliado(af); if (af) setStoredCupom(af.cupom); else clearStoredCupom(); }}
            onContinue={() => { setSignupStep("plano"); setErr(null); }}
            onBack={() => { setSignupStep("dados"); setErr(null); }}
          />
        ) : (
          <SignupDadosForm
            photo={photo} setPhoto={setPhoto}
            nome={nome} setNome={setNome}
            email={email} setEmail={setEmail}
            senha={senha} setSenha={setSenha}
            senha2={senha2} setSenha2={setSenha2}
            cor={cor} setCor={setCor}
            isBusy={isBusy} err={err} success={success}
            onSubmit={handleSignupNext}
            onLogin={() => { setMode("login"); setErr(null); }}
          />
        )}

        <div className="text-center text-xs text-[#6B7280] mt-6 font-display font-bold tracking-wide flex items-center justify-center gap-3">
          <Link to="/" className="hover:text-primary">Início</Link>
          <span className="opacity-30">·</span>
          <Link to="/precos" className="hover:text-primary">Preços</Link>
          <span className="opacity-30">·</span>
          <Link to="/termos" className="hover:text-primary">Termos</Link>
        </div>
      </div>
    </div>
  );
}

