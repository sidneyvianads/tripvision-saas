// Smoke tests R31 — paywall obrigatório no signup.
//
// Bug: usuários conseguiam acessar o app logados SEM passar pelo Mercado
// Pago. handleConfirmPlan tinha 2 caminhos (placeholder + catch) que
// deixavam o user logado solto, e App.jsx não verificava plano em
// nenhuma rota protegida.
//
// Fix:
//   R31-A: PaywallGate component
//   R31-B: App.jsx envolve 5 rotas core com PaywallGate
//   R31-C: nova rota /assinatura/pendente
//   R31-D: handleConfirmPlan navega pra /assinatura/pendente em vez
//          de fingir success

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const APP = join(SRC, "App.jsx");
const WELCOME = join(SRC, "pages/Welcome.jsx");
const PAYWALL = join(SRC, "components/PaywallGate.jsx");
const PENDENTE = join(SRC, "pages/AssinaturaPendente.jsx");
const PLANS = join(SRC, "data/plans.js");

describe("R31-A — PaywallGate component", () => {
  it("Arquivo existe + default export", () => {
    expect(existsSync(PAYWALL)).toBe(true);
    const src = readFileSync(PAYWALL, "utf8");
    expect(src).toMatch(/export default function PaywallGate/);
  });

  it("Usa hasActiveAccess do plans.js (não reinventa lógica)", () => {
    const src = readFileSync(PAYWALL, "utf8");
    expect(src).toMatch(/import \{ hasActiveAccess \} from ["']\.\.\/data\/plans["']/);
    expect(src).toMatch(/hasActiveAccess\(user\)/);
  });

  it("Redireciona pra /assinatura/pendente quando sem plano", () => {
    const src = readFileSync(PAYWALL, "utf8");
    expect(src).toMatch(/to=["']\/assinatura\/pendente["']/);
  });

  it("Redireciona pra /welcome quando sem user", () => {
    const src = readFileSync(PAYWALL, "utf8");
    expect(src).toMatch(/to=["']\/welcome["']/);
  });

  it("Preserva location.from pro callback pós-checkout", () => {
    const src = readFileSync(PAYWALL, "utf8");
    expect(src).toMatch(/state=\{\{ from:/);
  });
});

describe("R31-B — App.jsx aplica PaywallGate em 5 rotas core", () => {
  const src = readFileSync(APP, "utf8");

  it("Importa PaywallGate", () => {
    expect(src).toMatch(/import PaywallGate from ["']\.\/components\/PaywallGate["']/);
  });

  it("Rotas protegidas envolvidas: /, /v/new, /v/:slug/start, /v/:slug, /v/:slug/admin", () => {
    expect(src).toMatch(/<PaywallGate><MyTrips/);
    expect(src).toMatch(/<PaywallGate><NewTrip/);
    expect(src).toMatch(/<PaywallGate><ChooseFlow/);
    expect(src).toMatch(/<PaywallGate><TripView/);
    expect(src).toMatch(/<PaywallGate><AdminTrip/);
  });

  // Cada Route fica numa linha — extrai por linha pra evitar regex
  // greedy pegar JSX adjacente.
  const lineFor = (path) => src.split("\n").find((l) => l.includes(`<Route path="${path}"`));

  it("Account NÃO está atrás do gate (user precisa cancelar/sair)", () => {
    const line = lineFor("/conta");
    expect(line, "rota /conta não encontrada").toBeTruthy();
    expect(line).not.toMatch(/PaywallGate/);
  });

  it("/assinatura/pendente e /assinatura/sucesso NÃO estão atrás do gate", () => {
    const sucesso = lineFor("/assinatura/sucesso");
    const pendente = lineFor("/assinatura/pendente");
    expect(sucesso, "rota /assinatura/sucesso não encontrada").toBeTruthy();
    expect(pendente, "rota /assinatura/pendente não encontrada").toBeTruthy();
    expect(sucesso).not.toMatch(/PaywallGate/);
    expect(pendente).not.toMatch(/PaywallGate/);
  });

  it("Rota /assinatura/pendente registrada", () => {
    expect(src).toMatch(/<Route path="\/assinatura\/pendente"/);
    expect(src).toMatch(/<AssinaturaPendente/);
  });
});

describe("R31-C — AssinaturaPendente page", () => {
  it("Arquivo existe + default export", () => {
    expect(existsSync(PENDENTE)).toBe(true);
    const src = readFileSync(PENDENTE, "utf8");
    expect(src).toMatch(/export default function AssinaturaPendente/);
  });

  it("Reaproveita PlanPicker (não duplica)", () => {
    const src = readFileSync(PENDENTE, "utf8");
    expect(src).toMatch(/import PlanPicker from/);
    expect(src).toMatch(/<PlanPicker/);
  });

  it("Usa startCheckoutSession (mesmo flow do signup)", () => {
    const src = readFileSync(PENDENTE, "utf8");
    expect(src).toMatch(/import \{ startCheckoutSession \}/);
    expect(src).toMatch(/await startCheckoutSession\(/);
  });

  it("Redireciona pra / se hasActiveAccess vira true (webhook chegou)", () => {
    const src = readFileSync(PENDENTE, "utf8");
    expect(src).toMatch(/hasActiveAccess\(user\)/);
    expect(src).toMatch(/navigate\(["']\/["']/);
  });

  it("Logout button como saída secundária", () => {
    const src = readFileSync(PENDENTE, "utf8");
    expect(src).toMatch(/signOut/);
    // Texto user-facing inclui menção a outra conta
    expect(src).toMatch(/outra conta/);
  });
});

describe("R31-D — Welcome.handleConfirmPlan sem brechas", () => {
  const src = readFileSync(WELCOME, "utf8");

  it("Importa useNavigate", () => {
    expect(src).toMatch(/import \{ useSearchParams, useNavigate/);
  });

  it("placeholder=true navega pra /assinatura/pendente", () => {
    // O bloco placeholder + comentários inline pode ter >300 chars.
    // Usa indexOf-based slice em vez de regex frágil.
    const start = src.indexOf("if (result.placeholder)");
    expect(start, "bloco if (result.placeholder) ausente").toBeGreaterThan(-1);
    const slice = src.slice(start, start + 800);
    expect(slice).toMatch(/navigate\(["']\/assinatura\/pendente["']/);
  });

  it("Catch do checkout navega pra /assinatura/pendente", () => {
    // O catch tem o marker "checkout failed:" no console.error.
    const start = src.indexOf("checkout failed:");
    expect(start, "console.error 'checkout failed' ausente").toBeGreaterThan(-1);
    const slice = src.slice(start, start + 400);
    expect(slice).toMatch(/navigate\(["']\/assinatura\/pendente["']/);
  });

  it("Sem fallback setSuccess({plano:'pending'}) que vazava user logado", () => {
    // Tanto placeholder quanto catch antes faziam setSuccess({ email: created.email...}).
    // Agora os 2 caminhos navegam. O setSuccess que sobra é só pra confirmação
    // de signup-sem-checkout (não-usado nos paths atuais mas mantido por defesa).
    expect(src).not.toMatch(/setSuccess\(\{ email: created\.email/);
  });
});

describe("R31 — sanity: hasActiveAccess pre-existente não foi alterado", () => {
  const src = readFileSync(PLANS, "utf8");

  it("hasActiveAccess ainda exige plano_expires_at futuro (não-owner)", () => {
    expect(src).toMatch(/export function hasActiveAccess/);
    // owner bypassa
    expect(src).toMatch(/if \(user\.plano === ["']owner["']\) return true/);
    // pending/free/expired retorna false
    expect(src).toMatch(/EXPIRED_STATES\.has\(user\.plano\)/);
    // plano_expires_at NULL = expired (R8-5)
    expect(src).toMatch(/if \(!user\.plano_expires_at\) return false/);
  });
});
