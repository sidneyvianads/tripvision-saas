// R29-4: extraído do Welcome.jsx. Form de nova senha (mode === "reset"),
// renderizado depois que o user clicou no link de recuperação no email
// (useAuth detecta o event PASSWORD_RECOVERY e seta isRecovering).

import { KeyRound, Loader2 } from "lucide-react";
import { ErrorBox, Field, InfoBox, PasswordStrengthBar, passwordStrength } from "./_shared";

export default function ResetPasswordForm({
  senha, setSenha,
  senha2, setSenha2,
  loading, err, info,
  onSubmit,
}) {
  const senhaForca = passwordStrength(senha);
  const senhaValida = senhaForca?.valid === true;
  const senhasIguais = senha && senha === senha2;

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      <div className="text-center">
        <h2 className="font-display font-extrabold text-[#1F2937] text-lg">Nova senha</h2>
        <p className="text-[#6B7280] text-xs mt-1">
          Escolha uma senha forte. Mínimo 6 caracteres com letras e números.
        </p>
      </div>
      <Field icon={KeyRound} type="password" placeholder="nova senha" value={senha} onChange={setSenha} autoFocus autoComplete="new-password" />
      {senha && <PasswordStrengthBar strength={senhaForca} />}
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
  );
}
