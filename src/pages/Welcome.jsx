import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Mail, KeyRound, User, Sparkles, Check, Star, Gift } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import PhotoPicker from "../components/PhotoPicker";
import { AVATAR_COLORS } from "../data/types";
import { PLANS, PRICES, monthlyEquivalent, TRIAL_DAYS } from "../data/plans";
import Logo from "../components/Logo";
import { getStoredCupom, clearStoredCupom } from "../lib/cupom";
import { resolveOrigemPayload, clearStoredOrigem } from "../lib/origem";
import CupomField from "../components/CupomField";

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

  // Etapa 2: cria a conta (plano='pending') e redireciona pro Mercado Pago.
  // Não existe mais "começar Free" — todo cadastro entra no trial de 7 dias.
  const handleConfirmPlan = async (plano, ciclo = "mensal") => {
    setErr(null);
    try {
      // Resolve origem (organico / afiliado / instagram / google) ANTES do insert
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

      // Chama create-subscription e redireciona pro Mercado Pago
      try {
        const cupom = getStoredCupom() || null;
        const res = await fetch("/api/create-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plano,
            ciclo,
            userId: created.id,
            userEmail: created.email,
            cupom,
          }),
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
            Conta criada! Redirecionando pro login…
          </span>
        </div>
      )}

      <div className="card w-full max-w-md p-8 animate-fade-up relative z-10">
        <div className="text-center">
          <Link to="/" className="inline-block" aria-label="Viajjei">
            <Logo size={42} />
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
            <div className="flex items-center justify-center gap-1.5 text-[10px] font-display font-extrabold tracking-widest uppercase text-[#6366F1]">
              <span className="w-6 h-1 rounded-full bg-[#6366F1]" />
              <span className="w-6 h-1 rounded-full bg-[#E5E7EB]" />
              <span className="ml-1.5">Etapa 1 de 2</span>
            </div>

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
  const [ciclo, setCiclo] = useState("anual");
  const pro   = PLANS.pro;
  const grupo = PLANS.grupo;

  return (
    <div className="mt-6 space-y-3 animate-pop">
      <div className="flex items-center justify-center gap-1.5 text-[10px] font-display font-extrabold tracking-widest uppercase text-[#6366F1]">
        <span className="w-6 h-1 rounded-full bg-[#E5E7EB]" />
        <span className="w-6 h-1 rounded-full bg-[#6366F1]" />
        <span className="ml-1.5">Etapa 2 de 2</span>
      </div>

      <div className="text-center">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest uppercase"
          style={{ background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}
        >
          <Gift className="w-3 h-3" /> {TRIAL_DAYS} dias grátis — cancele quando quiser
        </div>
        <h2 className="font-display font-extrabold text-[#1F2937] text-xl mt-3">Escolha seu plano</h2>
        <p className="text-[#6B7280] text-xs mt-1">Não cobramos nada nos primeiros {TRIAL_DAYS} dias. Cancele a qualquer momento.</p>
      </div>

      <CycleToggle ciclo={ciclo} setCiclo={setCiclo} />

      {/* Card Pro */}
      <PlanCard
        plan={pro}
        ciclo={ciclo}
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
        disabled={loading || !!success}
        highlight
      />

      {/* Card Grupo */}
      <PlanCard
        plan={grupo}
        ciclo={ciclo}
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
        disabled={loading || !!success}
      />

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-700 text-sm">{err}</div>
      )}

      <div className="pt-1">
        <CupomField />
      </div>

      <button
        type="button"
        onClick={onBack}
        disabled={loading || !!success}
        className="text-sm text-[#64748B] hover:text-[#0F172A] font-display font-bold w-full text-center disabled:opacity-50 pt-1"
      >
        ← Voltar e ajustar dados
      </button>

      <p className="text-center text-[11px] text-[#94A3B8] pt-1">
        Pagamento via Mercado Pago. Sem cobrança nos primeiros {TRIAL_DAYS} dias.
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
  plan, ciclo, badge, bullets,
  ctaIcon: CtaIcon, accent, onClick, disabled, highlight,
}) {
  const isAnual = ciclo === "anual";
  const price = PRICES[plan.id]?.[ciclo];
  const monthlyEq = monthlyEquivalent(plan.id, ciclo);

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
        <div className="flex items-baseline gap-1">
          <span className="font-display font-extrabold text-4xl text-[#0F172A] tabular leading-none">
            R$ {formatPrice(monthlyEq)}
          </span>
          <span className="text-[13px] font-bold text-[#64748B]">/mês</span>
        </div>
        <div className="text-[12px] text-[#64748B] mt-1">
          {isAnual
            ? <>cobrado <strong className="text-[#0F172A]">R$ {formatPrice(price.amount)}/ano</strong> após o trial</>
            : "cobrado mensalmente após o trial"}
        </div>
        {isAnual && (
          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-display font-extrabold text-white" style={{ background: "#10B981" }}>
            economize 33% vs mensal
          </span>
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
        Começar teste grátis →
      </button>
    </div>
  );
}

function formatPrice(n) {
  return n.toFixed(2).replace(".", ",");
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

  let score = 1;
  if (s.length >= 10) score++;
  if (hasMixCase) score++;
  if (hasSymbol) score++;
  if (score === 1) return { valid: true, label: "ok", color: "#F59E0B", pct: 60, hint: null };
  if (score === 2) return { valid: true, label: "boa", color: "#10B981", pct: 80, hint: null };
  return { valid: true, label: "forte", color: "#10B981", pct: 100, hint: null };
}
