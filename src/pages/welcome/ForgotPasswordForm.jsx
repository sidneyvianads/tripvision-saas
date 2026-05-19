// R29-4: extraído do Welcome.jsx. Form de "Recuperar senha" (mode === "forgot").
// Pede email, dispara sendPasswordReset; usuário recebe link no email.

import { Loader2, Mail } from "lucide-react";
import { ErrorBox, Field, InfoBox } from "./_shared";

export default function ForgotPasswordForm({
  email, setEmail,
  loading, err, info,
  onSubmit, onBack,
}) {
  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
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
          onClick={onBack}
          className="font-display font-bold text-[#2E86C1] hover:underline"
        >
          ← Voltar pro login
        </button>
      </p>
    </form>
  );
}
