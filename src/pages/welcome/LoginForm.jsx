// R29-4: extraído do Welcome.jsx. Form de login (mode === "login").
//
// Toda a UX (toast "Conta criada!" inline, link "Esqueci a senha",
// switch pra signup) fica aqui. Welcome só passa state + handlers.

import { ArrowRight, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { ErrorBox, Field, InfoBox } from "./_shared";

export default function LoginForm({
  email, setEmail,
  senha, setSenha,
  loading, err, info, justSignedUpEmail,
  onSubmit, onForgot, onSignup,
}) {
  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
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
          onClick={onForgot}
          className="text-xs font-display font-bold text-[#64748B] hover:text-[#2E86C1] hover:underline"
        >
          Esqueci a senha
        </button>
      </div>

      <p className="text-center text-sm text-[#636E72] pt-2">
        Não tem conta?{" "}
        <button
          type="button"
          onClick={onSignup}
          className="font-display font-bold text-[#2E86C1] hover:underline"
        >
          Cadastre-se
        </button>
      </p>
    </form>
  );
}
