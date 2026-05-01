import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Mail, KeyRound, User, Sparkles, Check } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import PhotoPicker from "../components/PhotoPicker";
import { AVATAR_COLORS } from "../data/types";
import { PLANS, PRICES } from "../data/plans";

const REDIRECT_DELAY_MS = 1800;

export default function Welcome() {
  const { signIn, signUp, loading } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "login");
  const [err, setErr] = useState(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [senha2, setSenha2] = useState("");
  const [cor, setCor] = useState(AVATAR_COLORS[0].color);
  const [photo, setPhoto] = useState(null);

  const [success, setSuccess] = useState(null);
  const [justSignedUpEmail, setJustSignedUpEmail] = useState(null);

  // Sub-etapa do cadastro: 'dados' → 'plano'
  const [signupStep, setSignupStep] = useState("dados");

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
    setJustSignedUpEmail(null);
    try {
      await signIn(email, senha);
    } catch (e) {
      setErr(e.message);
    }
  };

  // Validação rigorosa: 6+ chars, pelo menos 1 letra, pelo menos 1 número
  const senhaForca = passwordStrength(senha);
  const senhaValida = senhaForca?.valid === true;
  const senhasIguais = senha && senha === senha2;

  // Etapa 1: validar dados → ir pro picker
  const handleSignupNext = (e) => {
    e.preventDefault();
    setErr(null);
    const nomeClean = nome.trim();
    if (!nomeClean) return setErr("Digite seu nome.");
    if (nomeClean.length > 50) return setErr("Nome muito longo (máx 50 caracteres).");
    if (!senhaValida) return setErr("Senha muito fraca — use no mínimo 6 caracteres com letras e números.");
    if (senha !== senha2) return setErr("As senhas não conferem.");
    if (!email.trim()) return setErr("Informe seu e-mail.");
    setSignupStep("plano");
  };

  // Etapa 2: cria a conta com o plano escolhido
  const handleConfirmPlan = async (plano) => {
    setErr(null);
    try {
      const created = await signUp({
        nome: nome.trim(),
        email,
        senha,
        avatar_cor: cor,
        avatar_url: photo,
        plano,
      });
      setSuccess({ email: created.email, nome: created.nome, plano });
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-5 py-10 relative overflow-hidden"
      style={{
        background: "radial-gradient(circle at top right, rgba(139, 92, 246, 0.08), transparent 50%), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.06), transparent 50%), #FAFBFC",
      }}
    >
      {success && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white rounded-2xl px-4 py-3 shadow-[0_8px_24px_rgba(46,204,113,0.35)] animate-fade-up flex items-center gap-2 max-w-[92vw]"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="font-display font-bold text-sm">
            Conta criada! Redirecionando pro login…
          </span>
        </div>
      )}

      <div className="card w-full max-w-md p-8 animate-fade-up relative z-10">
        <div className="text-center">
          <Link to="/" className="inline-block">
            <div className="text-5xl mb-2">🧳</div>
          </Link>
          <h1 className="text-3xl text-[#1F2937]">TripVision</h1>
          <p className="text-[#6B7280] mt-1 font-display font-bold text-sm">
            Planeje sua viagem conversando.
          </p>
          <p className="text-primary text-xs font-display font-bold uppercase tracking-widest mt-0.5">
            A IA faz o resto.
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

            <p className="text-center text-sm text-[#636E72] pt-2">
              Não tem conta?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setErr(null); setJustSignedUpEmail(null); }}
                className="font-display font-bold text-[#2E86C1] hover:underline"
              >
                Cadastre-se
              </button>
            </p>
          </form>
        ) : signupStep === "plano" ? (
          <PlanPicker
            onChoose={handleConfirmPlan}
            onBack={() => { setSignupStep("dados"); setErr(null); }}
            loading={loading || !!success}
            success={success}
            err={err}
          />
        ) : (
          <form onSubmit={handleSignupNext} className="mt-6 space-y-3">
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
                : <>Próximo: escolher plano <ArrowRight className="w-4 h-4" /></>}
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

function PlanPicker({ onChoose, onBack, loading, success, err }) {
  const free = PLANS.free;
  const pro  = PLANS.pro;
  const proAnual = PRICES.pro.anual;
  const proMensal = PRICES.pro.mensal;

  return (
    <div className="mt-6 space-y-3">
      <div className="text-center">
        <div className="text-2xl mb-1">✨</div>
        <h2 className="font-display font-extrabold text-[#1F2937] text-xl">Escolha seu plano</h2>
        <p className="text-[#6B7280] text-xs mt-1">Pode trocar depois.</p>
      </div>

      {/* Card Free */}
      <button
        type="button"
        onClick={() => onChoose("free")}
        disabled={loading || !!success}
        className="card w-full p-4 text-left active:scale-[0.99] transition disabled:opacity-60"
        style={{ borderLeft: "4px solid #6366F1" }}
      >
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{free.icon}</span>
            <span className="font-display font-extrabold text-[#1F2937]">{free.nome}</span>
          </div>
          <div className="font-display font-extrabold tabular text-[#1F2937]">R$ 0</div>
        </div>
        <p className="text-[12px] text-[#6B7280] mt-0.5">1 viagem · planeje sozinho · 5 msgs IA</p>
        <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-display font-bold text-[#6366F1]">
          Começar grátis <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </button>

      {/* Card Pro */}
      <button
        type="button"
        onClick={() => onChoose("pro")}
        disabled={loading || !!success}
        className="w-full p-4 rounded-2xl text-left active:scale-[0.99] transition disabled:opacity-60 relative"
        style={{
          background: "#FFFFFF",
          border: "2px solid #F59E0B",
          boxShadow: "0 8px 24px rgba(245, 158, 11, 0.20)",
        }}
      >
        <span
          className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] font-display font-extrabold tracking-widest text-white"
          style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24)" }}
        >
          MAIS POPULAR
        </span>
        <div className="flex items-baseline justify-between mt-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{pro.icon}</span>
            <span className="font-display font-extrabold text-[#1F2937]">{pro.nome}</span>
          </div>
          <div className="text-right">
            <div className="font-display font-extrabold tabular text-[#1F2937]">{proMensal.display.replace("/mês", "")}<span className="text-[11px] font-normal text-[#6B7280]">/mês</span></div>
            <div className="text-[10px] text-[#6B7280]">ou {proAnual.display} (-33%)</div>
          </div>
        </div>
        <ul className="mt-2 space-y-0.5">
          {[
            "3 viagens",
            "IA com pesquisa online",
            "Compartilhar com 5 pessoas",
            "Chat do grupo realtime",
            "Checklist ilimitado",
          ].map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[12px] text-[#374151]">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div
          className="mt-3 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-display font-extrabold text-white w-full"
          style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Escolher Pro
        </div>
        <div className="mt-1.5 text-center text-[10px] text-amber-700 font-display font-bold">
          ⏳ Período de teste — aproveite o Pro grátis enquanto liberamos pagamento
        </div>
      </button>

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-700 text-sm">{err}</div>
      )}

      <button
        type="button"
        onClick={onBack}
        disabled={loading || !!success}
        className="text-sm text-[#6B7280] hover:text-[#1F2937] font-display font-bold w-full text-center disabled:opacity-50"
      >
        ← Voltar e ajustar dados
      </button>
    </div>
  );
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

function passwordStrength(s) {
  if (!s) return null;
  const hasLength = s.length >= 6;
  const hasLetter = /[A-Za-z]/.test(s);
  const hasNumber = /\d/.test(s);
  const hasMixCase = /[a-z]/.test(s) && /[A-Z]/.test(s);
  const hasSymbol = /[^A-Za-z0-9]/.test(s);
  const valid = hasLength && hasLetter && hasNumber;

  if (!hasLength) return { valid: false, label: "muito curta", color: "#EF4444", pct: 15, hint: "mínimo 6 caracteres" };
  if (!hasLetter) return { valid: false, label: "muito fraca", color: "#EF4444", pct: 25, hint: "precisa de pelo menos 1 letra" };
  if (!hasNumber) return { valid: false, label: "muito fraca", color: "#EF4444", pct: 25, hint: "precisa de pelo menos 1 número" };

  // valid daqui pra baixo
  let score = 1;
  if (s.length >= 10) score++;
  if (hasMixCase) score++;
  if (hasSymbol) score++;
  if (score === 1) return { valid: true, label: "ok", color: "#F59E0B", pct: 60, hint: null };
  if (score === 2) return { valid: true, label: "boa", color: "#10B981", pct: 80, hint: null };
  return { valid: true, label: "forte", color: "#10B981", pct: 100, hint: null };
}
