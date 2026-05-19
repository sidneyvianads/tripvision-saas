// R29-1: primitives compartilhadas entre os sub-componentes do Welcome.
// Saíram do Welcome.jsx (que tinha 1031 LOC). Aqui ficam:
//
//   - Field: input com ícone à esquerda (login/signup/reset usam)
//   - ErrorBox / InfoBox: feedback boxes vermelho/verde
//   - StepIndicator: 3 dots do signup (etapa 1 → 2 → 3)
//   - passwordStrength: cálculo de força da senha
//   - colorFromName / initialsFromName: paleta determinística pro
//     avatar fallback do afiliado quando foto_url é null
//   - round2 / formatPrice: helpers numéricos pro PlanPicker
//   - TOTAL_STEPS: constante do flow de signup

import { CheckCircle2 } from "lucide-react";

export const TOTAL_STEPS = 3;

export function StepIndicator({ step }) {
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

export function Field({ icon: Icon, type, placeholder, value, onChange, autoFocus, maxLength, autoComplete, disabled }) {
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

export function ErrorBox({ msg }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-700 text-sm">
      {msg}
    </div>
  );
}

export function InfoBox({ msg }) {
  return (
    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800 text-sm flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  );
}

// R29-4: barra de força + label, renderizada idêntico em ResetPasswordForm
// e SignupDadosForm. Aceita o objeto retornado por passwordStrength().
export function PasswordStrengthBar({ strength }) {
  if (!strength) return null;
  return (
    <div className="px-1">
      <div className="h-1 rounded-full bg-[#E5E7EB] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${strength.pct}%`, background: strength.color }} />
      </div>
      <div className="text-[11px] mt-1 font-display font-bold flex items-center gap-1.5" style={{ color: strength.color }}>
        <span>{strength.valid ? "✓" : "⚠"}</span>
        <span>Força: {strength.label}</span>
        {strength.hint && <span className="text-[10px] opacity-80 font-display font-semibold normal-case">— {strength.hint}</span>}
      </div>
    </div>
  );
}

export function passwordStrength(s) {
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

// Paleta determinística pra fallback do avatar do afiliado.
const AVATAR_COLORS_FALLBACK = ["#F97316", "#6366F1", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4", "#EF4444"];

export function colorFromName(name) {
  const s = (name ?? "").trim();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS_FALLBACK[Math.abs(hash) % AVATAR_COLORS_FALLBACK.length];
}

export function initialsFromName(name) {
  return (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join("") || "?";
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function formatPrice(n) {
  return Number(n).toFixed(2).replace(".", ",");
}
