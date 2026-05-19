// Smoke tests R29 — refactor do Welcome.jsx (1031 LOC → orchestrator ~288 LOC).
//
// Garante que cada extração preserva o contrato com Welcome:
// - R29-1: primitives compartilhadas em _shared.jsx
// - R29-2: InfluencerStep com R11-4 refs pattern intacto
// - R29-3: PlanPicker + helpers privados
// - R29-4: 4 forms de auth (LoginForm/Forgot/Reset/SignupDados)
// - R29-5: useInviteToken hook
// - R29-6: startCheckoutSession em lib/checkout.js
// - Welcome orchestrator: handlers, imports, JSX só delega

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const WELCOME = join(SRC, "pages/Welcome.jsx");
const WELCOME_DIR = join(SRC, "pages/welcome");
const SHARED = join(WELCOME_DIR, "_shared.jsx");
const INFLUENCER = join(WELCOME_DIR, "InfluencerStep.jsx");
const PLAN_PICKER = join(WELCOME_DIR, "PlanPicker.jsx");
const LOGIN_FORM = join(WELCOME_DIR, "LoginForm.jsx");
const FORGOT_FORM = join(WELCOME_DIR, "ForgotPasswordForm.jsx");
const RESET_FORM = join(WELCOME_DIR, "ResetPasswordForm.jsx");
const SIGNUP_FORM = join(WELCOME_DIR, "SignupDadosForm.jsx");
const USE_INVITE = join(SRC, "hooks/useInviteToken.js");
const CHECKOUT = join(SRC, "lib/checkout.js");
const APP = join(SRC, "App.jsx");

describe("R29-1 — _shared.jsx primitives", () => {
  it("Arquivo existe", () => {
    expect(existsSync(SHARED)).toBe(true);
  });

  it("Exports principais presentes", () => {
    const src = readFileSync(SHARED, "utf8");
    for (const name of [
      "TOTAL_STEPS", "StepIndicator", "Field", "ErrorBox", "InfoBox",
      "passwordStrength", "PasswordStrengthBar",
      "colorFromName", "initialsFromName",
      "round2", "formatPrice",
    ]) {
      expect(src, `falta export ${name}`).toMatch(new RegExp(`export (function |const )?${name}\\b`));
    }
  });

  it("passwordStrength valida regras (min 6, letra, número)", () => {
    const src = readFileSync(SHARED, "utf8");
    expect(src).toMatch(/s\.length >= 6/);
    expect(src).toMatch(/\/\[A-Za-z\]\//);
    expect(src).toMatch(/\/\\d\//);
  });
});

describe("R29-2 — InfluencerStep extraído", () => {
  it("Arquivo existe + default export", () => {
    expect(existsSync(INFLUENCER)).toBe(true);
    const src = readFileSync(INFLUENCER, "utf8");
    expect(src).toMatch(/export default function InfluencerStep/);
  });

  it("API preservada: { selected, onSelect, onContinue, onBack }", () => {
    const src = readFileSync(INFLUENCER, "utf8");
    expect(src).toMatch(/InfluencerStep\(\{\s*selected,\s*onSelect,\s*onContinue,\s*onBack\s*\}\)/);
  });

  it("R11-4 refs pattern preservado (anti stale closure)", () => {
    const src = readFileSync(INFLUENCER, "utf8");
    expect(src).toMatch(/selectedRef\s*=\s*useRef\(selected\)/);
    expect(src).toMatch(/onSelectRef\s*=\s*useRef\(onSelect\)/);
    expect(src).toMatch(/onContinueRef\s*=\s*useRef\(onContinue\)/);
    // Effect copia props pras refs (sem deps explícitas, roda toda render)
    expect(src).toMatch(/selectedRef\.current\s*=\s*selected/);
  });

  it("Load assíncrono de afiliados (ativo=true, ordem nome)", () => {
    const src = readFileSync(INFLUENCER, "utf8");
    expect(src).toMatch(/\.from\(["']afiliados["']\)/);
    expect(src).toMatch(/\.eq\(["']ativo["'],\s*true\)/);
    expect(src).toMatch(/\.order\(["']nome["']\)/);
  });

  it("Pré-seleção por cupom URL usa ref pra ler selected atual", () => {
    const src = readFileSync(INFLUENCER, "utf8");
    expect(src).toMatch(/if \(!selectedRef\.current && initialCupom\)/);
  });

  it("Welcome.jsx importa InfluencerStep do path novo", () => {
    const src = readFileSync(WELCOME, "utf8");
    expect(src).toMatch(/import InfluencerStep from ["']\.\/welcome\/InfluencerStep["']/);
  });
});

describe("R29-3 — PlanPicker extraído", () => {
  it("Arquivo existe + default export", () => {
    expect(existsSync(PLAN_PICKER)).toBe(true);
    const src = readFileSync(PLAN_PICKER, "utf8");
    expect(src).toMatch(/export default function PlanPicker/);
  });

  it("API preservada: { afiliado, onChoose, onBack, loading, err }", () => {
    const src = readFileSync(PLAN_PICKER, "utf8");
    expect(src).toMatch(/PlanPicker\(\{\s*afiliado,\s*onChoose,\s*onBack,\s*loading,\s*err\s*\}\)/);
  });

  it("CycleToggle e PlanCard ficam no MESMO arquivo (privados)", () => {
    const src = readFileSync(PLAN_PICKER, "utf8");
    expect(src).toMatch(/^function CycleToggle/m);
    expect(src).toMatch(/^function PlanCard/m);
    // E não exportados
    expect(src).not.toMatch(/export (function |default )?CycleToggle/);
    expect(src).not.toMatch(/export (function |default )?PlanCard/);
  });

  it("Math do desconto: round2(monthlyEq * (1 - desconto/100))", () => {
    const src = readFileSync(PLAN_PICKER, "utf8");
    expect(src).toMatch(/round2\(monthlyEq\s*\*\s*\(1\s*-\s*desconto\s*\/\s*100\)\)/);
  });

  it("Welcome.jsx importa PlanPicker do path novo", () => {
    const src = readFileSync(WELCOME, "utf8");
    expect(src).toMatch(/import PlanPicker from ["']\.\/welcome\/PlanPicker["']/);
  });
});

describe("R29-4 — 4 forms de auth extraídos", () => {
  it("Todos os 4 arquivos existem + default export", () => {
    for (const [name, path] of [
      ["LoginForm", LOGIN_FORM],
      ["ForgotPasswordForm", FORGOT_FORM],
      ["ResetPasswordForm", RESET_FORM],
      ["SignupDadosForm", SIGNUP_FORM],
    ]) {
      expect(existsSync(path), `falta ${name}.jsx`).toBe(true);
      const src = readFileSync(path, "utf8");
      expect(src, `${name} sem default export`).toMatch(new RegExp(`export default function ${name}`));
    }
  });

  it("LoginForm: onForgot/onSignup separados pro mode-switch", () => {
    const src = readFileSync(LOGIN_FORM, "utf8");
    expect(src).toMatch(/onForgot/);
    expect(src).toMatch(/onSignup/);
    expect(src).toMatch(/justSignedUpEmail/);
  });

  it("ResetPasswordForm: usa PasswordStrengthBar do _shared", () => {
    const src = readFileSync(RESET_FORM, "utf8");
    expect(src).toMatch(/PasswordStrengthBar/);
    expect(src).toMatch(/from ["']\.\/_shared["']/);
  });

  it("SignupDadosForm: usa PhotoPicker e AVATAR_COLORS", () => {
    const src = readFileSync(SIGNUP_FORM, "utf8");
    expect(src).toMatch(/PhotoPicker/);
    expect(src).toMatch(/AVATAR_COLORS/);
    expect(src).toMatch(/PasswordStrengthBar/);
  });

  it("Welcome.jsx importa os 4 forms", () => {
    const src = readFileSync(WELCOME, "utf8");
    expect(src).toMatch(/import LoginForm from ["']\.\/welcome\/LoginForm["']/);
    expect(src).toMatch(/import ForgotPasswordForm from ["']\.\/welcome\/ForgotPasswordForm["']/);
    expect(src).toMatch(/import ResetPasswordForm from ["']\.\/welcome\/ResetPasswordForm["']/);
    expect(src).toMatch(/import SignupDadosForm from ["']\.\/welcome\/SignupDadosForm["']/);
  });

  it("Welcome.jsx NÃO contém mais os <form> inline dos 4 modes", () => {
    const src = readFileSync(WELCOME, "utf8");
    // Os formulários tinham marcadores únicos no body. Se algum voltou, falha.
    expect(src).not.toMatch(/Esqueci a senha/);          // estava no LoginForm
    expect(src).not.toMatch(/Recuperar senha/);          // estava no ForgotPasswordForm
    expect(src).not.toMatch(/Atualizar senha/);          // estava no ResetPasswordForm
    expect(src).not.toMatch(/Cor do avatar/);            // estava no SignupDadosForm
  });
});

describe("R29-5 — useInviteToken hook", () => {
  it("Hook existe + export named + constant key", () => {
    expect(existsSync(USE_INVITE)).toBe(true);
    const src = readFileSync(USE_INVITE, "utf8");
    expect(src).toMatch(/export function useInviteToken/);
    expect(src).toMatch(/export const PENDING_INVITE_KEY\s*=\s*["']viajjei:pending_invite["']/);
  });

  it("Effect: ?invite= → sessionStorage.setItem", () => {
    const src = readFileSync(USE_INVITE, "utf8");
    expect(src).toMatch(/params\.get\(["']invite["']\)/);
    expect(src).toMatch(/sessionStorage\.setItem\(PENDING_INVITE_KEY/);
  });

  it("Welcome chama useInviteToken() no body", () => {
    const src = readFileSync(WELCOME, "utf8");
    expect(src).toMatch(/import \{ useInviteToken \} from ["']\.\.\/hooks\/useInviteToken["']/);
    expect(src).toMatch(/useInviteToken\(\)/);
  });

  it("App.jsx usa a constante PENDING_INVITE_KEY (não hardcode)", () => {
    const src = readFileSync(APP, "utf8");
    expect(src).toMatch(/import \{ PENDING_INVITE_KEY \} from/);
    expect(src).toMatch(/sessionStorage\.getItem\(PENDING_INVITE_KEY\)/);
    expect(src).toMatch(/sessionStorage\.removeItem\(PENDING_INVITE_KEY\)/);
  });
});

describe("R29-6 — startCheckoutSession em lib/checkout.js", () => {
  it("Arquivo existe + export named", () => {
    expect(existsSync(CHECKOUT)).toBe(true);
    const src = readFileSync(CHECKOUT, "utf8");
    expect(src).toMatch(/export async function startCheckoutSession/);
  });

  it("Trata 503 com placeholder=true (não throws)", () => {
    const src = readFileSync(CHECKOUT, "utf8");
    expect(src).toMatch(/res\.status === 503 && data\?\.placeholder/);
    expect(src).toMatch(/return \{ placeholder: true \}/);
  });

  it("Throws sem accessToken (não dispara fetch)", () => {
    const src = readFileSync(CHECKOUT, "utf8");
    expect(src).toMatch(/if \(!accessToken\)/);
    expect(src).toMatch(/Sessão não disponível/);
  });

  it("Welcome.jsx usa startCheckoutSession (não fetch inline)", () => {
    const src = readFileSync(WELCOME, "utf8");
    expect(src).toMatch(/import \{ startCheckoutSession \} from ["']\.\.\/lib\/checkout["']/);
    expect(src).toMatch(/await startCheckoutSession\(/);
    // E o fetch inline pra /api/create-subscription NÃO está mais lá
    expect(src).not.toMatch(/\/api\/create-subscription/);
  });
});

describe("Welcome orchestrator — integridade pós-refactor", () => {
  const src = readFileSync(WELCOME, "utf8");

  it("Mantém os 5 handlers", () => {
    for (const fn of ["handleLogin", "handleForgot", "handleReset", "handleSignupNext", "handleConfirmPlan"]) {
      expect(src, `falta ${fn}`).toMatch(new RegExp(`const ${fn}\\s*=`));
    }
  });

  it("Mantém os 2 effects (isRecovering + success cleanup)", () => {
    expect(src).toMatch(/if \(isRecovering && mode !== ["']reset["']\)/);
    expect(src).toMatch(/if \(!success\) return/);
  });

  it("Conta de LOC abaixo de 350 (orchestrator enxuto)", () => {
    const loc = src.split("\n").length;
    expect(loc, `Welcome.jsx tem ${loc} LOC`).toBeLessThan(350);
  });

  it("Switch entre 6 modes/steps (login/forgot/reset/dados/cupom/plano)", () => {
    expect(src).toMatch(/mode === ["']login["']/);
    expect(src).toMatch(/mode === ["']forgot["']/);
    expect(src).toMatch(/mode === ["']reset["']/);
    expect(src).toMatch(/signupStep === ["']plano["']/);
    expect(src).toMatch(/signupStep === ["']cupom["']/);
    // 'dados' é o default (else) — verificamos via render do SignupDadosForm
    expect(src).toMatch(/<SignupDadosForm/);
  });

  it("Renderiza os 6 sub-componentes (LoginForm/Forgot/Reset/PlanPicker/Influencer/SignupDados)", () => {
    for (const tag of [
      "<LoginForm", "<ForgotPasswordForm", "<ResetPasswordForm",
      "<PlanPicker", "<InfluencerStep", "<SignupDadosForm",
    ]) {
      expect(src, `falta ${tag}`).toMatch(tag);
    }
  });

  it("Preserva URL back-compat: ?mode=signup ainda funciona", () => {
    expect(src).toMatch(/params\.get\(["']mode["']\) === ["']signup["']/);
  });
});
