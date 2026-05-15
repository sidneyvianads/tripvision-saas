import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Mail, KeyRound, User, Sparkles, Check, Star, Gift, AtSign } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import PhotoPicker from "../components/PhotoPicker";
import { AVATAR_COLORS } from "../data/types";
import { PLANS, PRICES, monthlyEquivalent, TRIAL_DAYS } from "../data/plans";
import Logo from "../components/Logo";
import { getStoredCupom, setStoredCupom, clearStoredCupom } from "../lib/cupom";
import { resolveOrigemPayload, clearStoredOrigem } from "../lib/origem";
import { supabase } from "../lib/supabase";
import { trackPaymentStarted } from "../lib/analytics";

const REDIRECT_DELAY_MS = 1800;
const TOTAL_STEPS = 3;

export default function Welcome() {
  const { signIn, signUp, loading, sendPasswordReset, updatePassword, clearRecovering } = useAuth();
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

  // Detecta retorno do link de reset de senha. Supabase emite o evento
  // PASSWORD_RECOVERY quando o hash da URL é consumido por detectSessionInUrl.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
        setErr(null);
        setInfo("Defina sua nova senha abaixo.");
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

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
      setErr(e.message);
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
      setErr(e.message);
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
      setErr(e.message);
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
        setErr(`Sua conta foi criada, mas não consegui abrir o pagamento agora (${e.message}). Faça login e tente o upgrade pelo painel.`);
        setSuccess({ email: created.email, nome: created.nome, plano: "pending" });
      }
    } catch (e) {
      setErr(e.message);
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

// =============== INDICADOR DE PASSOS ===============

function StepIndicator({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 text-[10px] font-display font-extrabold tracking-widest uppercase text-[#6366F1]">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <span
            key={idx}
            className="w-2.5 h-2.5 rounded-full transition-all"
            style={{
              background: active ? "#6366F1" : done ? "#A5B4FC" : "#E5E7EB",
              transform: active ? "scale(1.25)" : "scale(1)",
            }}
          />
        );
      })}
      <span className="ml-2">Etapa {step} de {TOTAL_STEPS}</span>
    </div>
  );
}

// =============== ETAPA 2: ESCOLHER INFLUENCIADOR ===============

// Paleta determinística pra fallback do avatar (quando o afiliado não tem foto_url).
const AVATAR_COLORS_FALLBACK = ["#F97316", "#6366F1", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4", "#EF4444"];
function colorFromName(name) {
  const s = (name ?? "").trim();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS_FALLBACK[Math.abs(hash) % AVATAR_COLORS_FALLBACK.length];
}
function initialsFromName(name) {
  return (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join("") || "?";
}

function InfluencerStep({ selected, onSelect, onContinue, onBack }) {
  const [afiliados, setAfiliados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cupom da URL (?cupom=X) — usado pra pré-selecionar
  const initialCupom = useMemo(() => (selected?.cupom ?? getStoredCupom() ?? "").toUpperCase(), [selected]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: err } = await supabase
        .from("afiliados")
        .select("id, nome, instagram, cupom, desconto_percent, foto_url")
        .eq("ativo", true)
        .order("nome");
      if (!active) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const list = data ?? [];
      setAfiliados(list);
      setLoading(false);

      // Lista vazia → não tem o que mostrar nessa etapa, pula direto pro plano
      if (list.length === 0) {
        onContinue();
        return;
      }

      // Pré-seleciona pelo cupom da URL (se algum afiliado da lista bater)
      if (!selected && initialCupom) {
        const match = list.find((a) => a.cupom?.toUpperCase() === initialCupom);
        if (match) onSelect(match);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-6 space-y-4 animate-pop">
      <StepIndicator step={2} />

      <div className="text-center">
        <div className="text-4xl mb-1">🎟️</div>
        <h2 className="font-display font-extrabold text-[#1F2937] text-xl">
          Quem te indicou?
        </h2>
        <p className="text-[#6B7280] text-sm mt-1">
          Escolha o influenciador que falou do Viajjei pra você.
        </p>
      </div>

      {/* Banner: pré-selecionado por URL */}
      {selected && initialCupom && (
        <div
          className="rounded-2xl p-3 animate-pop"
          style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)", border: "1.5px solid #6EE7B7" }}
        >
          <div className="text-emerald-900 text-[13px] font-display font-bold">
            ✅ Você foi indicado por <strong>{selected.nome}</strong>! Confirme abaixo ou troque a seleção.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[#F97316]" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
          Não consegui carregar a lista de influenciadores: {error}
        </div>
      ) : (
        <ul className="space-y-2 max-h-[420px] overflow-y-auto -mr-2 pr-2">
          {afiliados.map((af) => {
            const isSelected = selected?.id === af.id;
            const desconto = Number(af.desconto_percent ?? 0);
            return (
              <li key={af.id}>
                <button
                  type="button"
                  onClick={() => onSelect(isSelected ? null : af)}
                  className="w-full text-left rounded-2xl p-3 flex items-center gap-3 transition active:scale-[0.99]"
                  style={{
                    background: "white",
                    border: isSelected ? "2px solid #F97316" : "1.5px solid #E2E8F0",
                    boxShadow: isSelected ? "0 8px 24px rgba(249, 115, 22, 0.20)" : "0 1px 3px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <InfluencerAvatar af={af} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-[#0F172A] truncate">{af.nome}</div>
                    {af.instagram && (
                      <div className="text-[12px] text-[#64748B] truncate inline-flex items-center gap-1">
                        <AtSign className="w-3 h-3" /> {af.instagram.replace(/^@/, "")}
                      </div>
                    )}
                    {desconto > 0 && (
                      <div className="mt-1">
                        <span
                          className="inline-block text-[10px] px-2 py-0.5 rounded-full font-display font-extrabold uppercase tracking-widest"
                          style={{ background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}
                        >
                          {desconto.toFixed(0)}% off no 1º mês
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[11px] font-display font-extrabold px-3 py-1.5 rounded-full whitespace-nowrap"
                    style={{
                      background: isSelected ? "#F97316" : "#F1F5F9",
                      color: isSelected ? "white" : "#475569",
                    }}
                  >
                    {isSelected ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Escolhido</span> : "Escolher"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Confirmação pós-seleção */}
      {selected && (
        <div className="text-center text-[13px] font-display font-bold text-emerald-700">
          ✅ Indicado por {selected.nome}!
        </div>
      )}

      {/* CTAs */}
      {selected ? (
        <button
          type="button"
          onClick={onContinue}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
          style={{ background: "#F97316" }}
        >
          Continuar <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => { clearStoredCupom(); onContinue(); }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-display font-extrabold text-sm border-2 transition hover:bg-[#F8FAFC]"
          style={{ borderColor: "#E2E8F0", color: "#0F172A", background: "white" }}
        >
          Ninguém me indicou — Pular <ArrowRight className="w-4 h-4" />
        </button>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-[#64748B] hover:text-[#0F172A] font-display font-bold w-full text-center pt-1"
      >
        ← Voltar
      </button>
    </div>
  );
}

function InfluencerAvatar({ af }) {
  const size = 48;
  if (af.foto_url) {
    return (
      <img
        src={af.foto_url}
        alt={af.nome}
        width={size}
        height={size}
        loading="lazy"
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, background: "#F1F5F9" }}
        onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "flex"; }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-white font-display font-extrabold"
      style={{ width: size, height: size, background: colorFromName(af.nome), fontSize: 18 }}
    >
      {initialsFromName(af.nome)}
    </div>
  );
}

// =============== ETAPA 3: PLAN PICKER ===============

function PlanPicker({ afiliado, onChoose, onBack, loading, err }) {
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

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function formatPrice(n) {
  return Number(n).toFixed(2).replace(".", ",");
}

function Field({ icon: Icon, type, placeholder, value, onChange, autoFocus, maxLength, autoComplete, disabled }) {
  return (
    <label className="relative block">
      <Icon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B2BEC3] pointer-events-none" />
      <input
        type={type}
        autoFocus={autoFocus}
        maxLength={maxLength}
        autoComplete={autoComplete}
        disabled={disabled}
        className="input pl-11 disabled:opacity-60 disabled:cursor-not-allowed"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </label>
  );
}

function ErrorBox({ msg }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-700 text-sm">
      {msg}
    </div>
  );
}

function InfoBox({ msg }) {
  return (
    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800 text-sm flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  );
}

function passwordStrength(s) {
  if (!s) return null;
  const hasLength = s.length >= 6;
  const hasLetter = /[A-Za-z]/.test(s);
  const hasNumber = /\d/.test(s);
  const hasMixCase = /[a-z]/.test(s) && /[A-Z]/.test(s);
  const hasSymbol = /[^A-Za-z0-9]/.test(s);

  if (!hasLength) return { valid: false, label: "muito curta", color: "#EF4444", pct: 15, hint: "mínimo 6 caracteres" };
  if (!hasLetter) return { valid: false, label: "muito fraca", color: "#EF4444", pct: 25, hint: "precisa de pelo menos 1 letra" };
  if (!hasNumber) return { valid: false, label: "muito fraca", color: "#EF4444", pct: 25, hint: "precisa de pelo menos 1 número" };

  let score = 1;
  if (s.length >= 10) score++;
  if (hasMixCase) score++;
  if (hasSymbol) score++;
  if (score === 1) return { valid: true, label: "ok", color: "#F59E0B", pct: 60, hint: null };
  if (score === 2) return { valid: true, label: "boa", color: "#10B981", pct: 80, hint: null };
  return { valid: true, label: "forte", color: "#10B981", pct: 100, hint: null };
}
