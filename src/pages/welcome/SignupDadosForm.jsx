// R29-4: extraído do Welcome.jsx. Etapa 1 do signup (dados do user:
// foto, nome, email, senha+confirmação, cor do avatar).
//
// Próximo passo (etapa 2 = InfluencerStep, etapa 3 = PlanPicker) é
// gerenciado pelo orchestrator — esse form só valida e chama onSubmit.

import { ArrowRight, KeyRound, Mail, User } from "lucide-react";
import PhotoPicker from "../../components/PhotoPicker";
import { AVATAR_COLORS } from "../../data/types";
import { ErrorBox, Field, PasswordStrengthBar, StepIndicator, passwordStrength } from "./_shared";

export default function SignupDadosForm({
  photo, setPhoto,
  nome, setNome,
  email, setEmail,
  senha, setSenha,
  senha2, setSenha2,
  cor, setCor,
  isBusy, err, success,
  onSubmit, onLogin,
}) {
  const senhaForca = passwordStrength(senha);
  const senhaValida = senhaForca?.valid === true;
  const senhasIguais = senha && senha === senha2;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
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
      {senha && <PasswordStrengthBar strength={senhaForca} />}
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
          onClick={onLogin}
          className="font-display font-bold text-[#2E86C1] hover:underline"
          disabled={isBusy}
        >
          Entrar
        </button>
      </p>
    </form>
  );
}
