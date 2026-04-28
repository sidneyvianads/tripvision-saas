import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Mail, KeyRound, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Snow from "../components/ambient/Snow";
import Pines from "../components/ambient/Pines";
import PhotoPicker from "../components/PhotoPicker";
import { AVATAR_COLORS } from "../data/types";

const REDIRECT_DELAY_MS = 1800;

export default function Welcome() {
  const { signIn, signUp, loading } = useAuth();
  const [mode, setMode] = useState("login");
  const [err, setErr] = useState(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [senha2, setSenha2] = useState("");
  const [cor, setCor] = useState(AVATAR_COLORS[0].color);
  const [photo, setPhoto] = useState(null);

  const [success, setSuccess] = useState(null);
  const [justSignedUpEmail, setJustSignedUpEmail] = useState(null);

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

  const handleSignup = async (e) => {
    e.preventDefault();
    setErr(null);
    if (senha.length < 6) return setErr("Senha precisa ter no mínimo 6 caracteres.");
    if (senha !== senha2) return setErr("As senhas não conferem.");
    try {
      const created = await signUp({ nome, email, senha, avatar_cor: cor, avatar_url: photo });
      setSuccess({ email: created.email, nome: created.nome });
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-5 py-10 gradient-night relative overflow-hidden">
      <Snow count={70} />
      <Pines className="h-24 opacity-40" color="#0A1320" />

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
          <div className="text-6xl mb-3">🧳</div>
          <h1 className="text-3xl text-[#0F1B2D]">TripVision</h1>
          <p className="text-[#1A3A4A] mt-1 font-display font-bold text-sm">
            Planeje sua viagem conversando.
          </p>
          <p className="text-[#7CB9E8] text-xs font-display font-bold uppercase tracking-widest mt-0.5">
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
        ) : (
          <form onSubmit={handleSignup} className="mt-6 space-y-3">
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

            <button
              type="submit"
              className="btn-primary w-full inline-flex items-center justify-center gap-2 mt-2"
              disabled={isBusy}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando conta…</>
                : success
                  ? <><CheckCircle2 className="w-4 h-4" /> Conta criada!</>
                  : <>Criar conta <ArrowRight className="w-4 h-4" /></>}
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

        <p className="text-center text-xs text-[#7CB9E8] mt-6 font-display font-bold tracking-wide">
          🧳 TripVision SaaS · MVP
        </p>
      </div>
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
