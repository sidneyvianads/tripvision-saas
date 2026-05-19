import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Mail, KeyRound, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import PhotoPicker from "../components/PhotoPicker";
import { AVATAR_COLORS } from "../data/types";
import Logo from "../components/Logo";
import { getStoredCupom, setStoredCupom, clearStoredCupom } from "../lib/cupom";
import { resolveOrigemPayload, clearStoredOrigem } from "../lib/origem";
import { supabase } from "../lib/supabase";
import { trackPaymentStarted } from "../lib/analytics";
import { friendlyError } from "../lib/errorMessages";
import {
  Field, ErrorBox, InfoBox, StepIndicator, passwordStrength,
} from "./welcome/_shared";
import InfluencerStep from "./welcome/InfluencerStep";
import PlanPicker from "./welcome/PlanPicker";

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

  const senhaForca = passwordStrength(senha);
  const senhaValida = senhaForca?.valid === true;
  const senhasIguais = senha && senha === senha2;

  // Etapa 1 → 2
  const handleSignupNext = (e) => {
    e.preventDefault();
    setErr(null);
    const nomeClean = nome.trim();
    if (!nomeClean) return setErr("Digite seu nome.");
    if (nomeClean.length > 50) return setErr("Nome muito longo (máx 50 caracteres).");
    if (!senhaValida) return setErr("Senha muito fraca — use no mínimo 6 caracteres com letras e números.");
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
          <form onSubmit={handleLogin} className="mt-8 space-y-3">
            <Field icon={Mail} type="email" placeholder="seu@email.com" value={email} onChange={setEmail} autoFocus autoComplete="email" />
            {justSignedUpEmail && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800 text-sm flex items-center gap-2 animate-pop">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Conta criada! Digite sua senha pra entrar.</span>
              </div>
            )}
            <Field icon={KeyRound} type="password" placeholder="senha" value={senha} onChange={setSenha} autoComplete="current-password" />

            <button type="submit" className="btn-primary w-full inline-flex items-center justify-center gap-2" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Entrar
            </button>

            {err && <ErrorBox msg={err} />}
            {info && <InfoBox msg={info} />}

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setMode("forgot"); setErr(null); setInfo(null); setSenha(""); }}
                className="text-xs font-display font-bold text-[#64748B] hover:text-[#2E86C1] hover:underline"
              >
                Esqueci a senha
              </button>
            </div>

            <p className="text-center text-sm text-[#636E72] pt-2">
              Não tem conta?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setErr(null); setInfo(null); setJustSignedUpEmail(null); }}
                className="font-display font-bold text-[#2E86C1] hover:underline"
              >
                Cadastre-se
              </button>
            </p>
          </form>
        ) : mode === "forgot" ? (
          <form onSubmit={handleForgot} className="mt-8 space-y-3">
            <div className="text-center">
              <h2 className="font-display font-extrabold text-[#1F2937] text-lg">Recuperar senha</h2>
              <p className="text-[#6B7280] text-xs mt-1">
                Digite seu email. A gente envia um link pra você criar uma senha nova.
              </p>
            </div>
            <Field icon={Mail} type="email" placeholder="seu@email.com" value={email} onChange={setEmail} autoFocus autoComplete="email" />
            <button type="submit" className="btn-primary w-full inline-flex items-center justify-center gap-2" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Enviar link
            </button>
            {err && <ErrorBox msg={err} />}
            {info && <InfoBox msg={info} />}
            <p className="text-center text-sm text-[#636E72] pt-2">
              <button
                type="button"
                onClick={() => { setMode("login"); setErr(null); setInfo(null); }}
                className="font-display font-bold text-[#2E86C1] hover:underline"
              >
                ← Voltar pro login
              </button>
            </p>
          </form>
        ) : mode === "reset" ? (
          <form onSubmit={handleReset} className="mt-8 space-y-3">
            <div className="text-center">
              <h2 className="font-display font-extrabold text-[#1F2937] text-lg">Nova senha</h2>
              <p className="text-[#6B7280] text-xs mt-1">
                Escolha uma senha forte. Mínimo 6 caracteres com letras e números.
              </p>
            </div>
            <Field icon={KeyRound} type="password" placeholder="nova senha" value={senha} onChange={setSenha} autoFocus autoComplete="new-password" />
            {senha && senhaForca && (
              <div className="px-1">
                <div className="h-1 rounded-full bg-[#E5E7EB] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${senhaForca.pct}%`, background: senhaForca.color }} />
                </div>
                <div className="text-[11px] mt-1 font-display font-bold flex items-center gap-1.5" style={{ color: senhaForca.color }}>
                  <span>{senhaForca.valid ? "✓" : "⚠"}</span>
                  <span>Força: {senhaForca.label}</span>
                  {senhaForca.hint && <span className="text-[10px] opacity-80 font-display font-semibold normal-case">— {senhaForca.hint}</span>}
                </div>
              </div>
            )}
            <Field icon={KeyRound} type="password" placeholder="confirmar nova senha" value={senha2} onChange={setSenha2} autoComplete="new-password" />
            <button
              type="submit"
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
              disabled={loading || !senhaValida || !senhasIguais}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Atualizar senha
            </button>
            {err && <ErrorBox msg={err} />}
            {info && <InfoBox msg={info} />}
          </form>
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
          <form onSubmit={handleSignupNext} className="mt-6 space-y-3">
            <StepIndicator step={1} />

            <div className="flex justify-center pt-1 pb-2">
              <PhotoPicker
                value={photo}
                onChange={setPhoto}
                fallbackCor={cor}
                fallbackInitial={(nome.trim().charAt(0) || "📸").toUpperCase()}
                size={88}
                disabled={isBusy}
              />
            </div>
            <Field icon={User} type="text" placeholder="Seu nome" value={nome} onChange={setNome} autoFocus maxLength={40} autoComplete="given-name" disabled={isBusy} />
            <Field icon={Mail} type="email" placeholder="seu@email.com" value={email} onChange={setEmail} autoComplete="email" disabled={isBusy} />
            <Field icon={KeyRound} type="password" placeholder="senha (mín. 6)" value={senha} onChange={setSenha} autoComplete="new-password" disabled={isBusy} />
            {senha && senhaForca && (
              <div className="px-1">
                <div className="h-1 rounded-full bg-[#E5E7EB] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${senhaForca.pct}%`, background: senhaForca.color }} />
                </div>
                <div className="text-[11px] mt-1 font-display font-bold flex items-center gap-1.5" style={{ color: senhaForca.color }}>
                  <span>{senhaForca.valid ? "✓" : "⚠"}</span>
                  <span>Força: {senhaForca.label}</span>
                  {senhaForca.hint && <span className="text-[10px] opacity-80 font-display font-semibold normal-case">— {senhaForca.hint}</span>}
                </div>
              </div>
            )}
            <Field icon={KeyRound} type="password" placeholder="confirmar senha" value={senha2} onChange={setSenha2} autoComplete="new-password" disabled={isBusy} />

            <div className="pt-1">
              <div className="text-xs font-display font-bold text-[#636E72] mb-1.5">Cor do avatar</div>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map((c) => {
                  const active = cor === c.color;
                  return (
                    <button
                      type="button"
                      key={c.color}
                      onClick={() => setCor(c.color)}
                      aria-label={c.label}
                      title={c.label}
                      disabled={isBusy}
                      className="w-9 h-9 rounded-full transition-all disabled:opacity-50"
                      style={{
                        background: c.color,
                        outline: active ? `3px solid ${c.color}` : "none",
                        outlineOffset: 2,
                        transform: active ? "scale(1.05)" : "scale(1)",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {senha && senha2 && !senhasIguais && !success && (
              <div className="text-[11px] text-red-600 px-1 -mt-1">As senhas não conferem.</div>
            )}

            <button
              type="submit"
              className="btn-primary w-full inline-flex items-center justify-center gap-2 mt-2"
              disabled={isBusy || !senhaValida || !senhasIguais || !nome.trim() || !email.trim()}
            >
              {!senhaValida && senha
                ? <>Senha muito fraca</>
                : <>Próximo <ArrowRight className="w-4 h-4" /></>}
            </button>

            {err && <ErrorBox msg={err} />}

            <p className="text-center text-sm text-[#636E72] pt-2">
              Já tem conta?{" "}
              <button
                type="button"
                onClick={() => { setMode("login"); setErr(null); }}
                className="font-display font-bold text-[#2E86C1] hover:underline"
                disabled={isBusy}
              >
                Entrar
              </button>
            </p>
          </form>
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

