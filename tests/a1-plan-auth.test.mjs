// Smoke tests A1 — autenticar /api/plan.
//
// Antes: /api/plan era ANÔNIMO e confiava em user_plano/user_id do body.
// Qualquer um POST com {message, user_plano:"owner"} obtinha IA+grounding
// grátis e ilimitado. Fix: replica o padrão de chat.mjs — exige
// Authorization: Bearer, deriva o plano do banco pelo userId do token, e
// descarta user_plano/user_id do body. O front (PlanChat) passa a enviar
// o token. Validação E2E real (headless Chromium+WebKit) roda fora destes
// smokes, no deploy-preview, antes do merge.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAN = resolve(__dirname, "../netlify/functions/plan.mjs");
const PLANCHAT = resolve(__dirname, "../src/components/PlanChat.jsx");

describe("A1 — plan.mjs exige auth e deriva plano do JWT", () => {
  const src = readFileSync(PLAN, "utf8");

  it("Tem verifyAuth validando Bearer contra /auth/v1/user", () => {
    expect(src).toMatch(/async function verifyAuth\(req\)/);
    expect(src).toMatch(/authHeader\?\.startsWith\("Bearer "\)/);
    expect(src).toMatch(/\/auth\/v1\/user/);
  });

  it("Handler rejeita com 401 quando não autenticado", () => {
    expect(src).toMatch(/const authed = await verifyAuth\(req\)/);
    expect(src).toMatch(/if \(!authed\)/);
    expect(src).toMatch(/scope: "auth"\s*\}\s*,\s*401/);
  });

  it("userId vem do token, não do body", () => {
    expect(src).toMatch(/const userId = authed\.id/);
  });

  it("Body NÃO desestrutura mais user_plano/user_id", () => {
    // A linha de destructure do body deve conter só message/history/viagem.
    const destructure = src.match(/const \{ message[^\n]*\} = body \?\? \{\};/);
    expect(destructure?.[0]).toBeTruthy();
    expect(destructure[0]).not.toMatch(/user_plano/);
    expect(destructure[0]).not.toMatch(/user_id/);
  });

  it("effectivePlan é derivado de fetchUserPlan(userId), não do body", () => {
    expect(src).toMatch(/const dbUser = await fetchUserPlan\(userId\)/);
    expect(src).toMatch(/let effectivePlan = dbUser\?\.plano \?\? "pending"/);
    // Anti-regressão: não pode voltar a inicializar do body.
    expect(src).not.toMatch(/let effectivePlan = user_plano/);
  });

  it("Gates de no-access e mensal preservados, agora com userId", () => {
    expect(src).toMatch(/NO-ACCESS GATE blocked/);
    expect(src).toMatch(/MONTHLY GATE blocked/);
    expect(src).toMatch(/countMonthlyUserMessages\(userId\)/);
    expect(src).toMatch(/effectivePlan !== "owner"/);
  });

  it("Rate limit usa userId (sempre presente após auth)", () => {
    expect(src).toMatch(/plan:user:\$\{userId\}/);
  });

  it("ANON key dedicado adicionado; SERVICE key preservado p/ fetchUserPlan", () => {
    expect(src).toMatch(/const SUPABASE_ANON_KEY = process\.env\.VITE_SUPABASE_ANON_KEY/);
    // verifyAuth usa o anon key como apikey
    expect(src).toMatch(/apikey: SUPABASE_ANON_KEY/);
    // fetchUserPlan continua no SERVICE key (bypassa RLS de propósito)
    expect(src).toMatch(/const SUPABASE_KEY = process\.env\.SUPABASE_SERVICE_KEY/);
    expect(src).toMatch(/apikey: SUPABASE_KEY, Authorization: `Bearer \$\{SUPABASE_KEY\}`/);
  });
});

describe("A1 — PlanChat.jsx envia Bearer token", () => {
  const src = readFileSync(PLANCHAT, "utf8");

  it("streamPlan pega a sessão e envia Authorization: Bearer", () => {
    expect(src).toMatch(/await supabase\.auth\.getSession\(\)/);
    expect(src).toMatch(/Authorization: `Bearer \$\{session\.access_token\}`/);
  });

  it("Sem sessão → erro amigável antes do fetch", () => {
    expect(src).toMatch(/if \(!session\?\.access_token\) throw new Error\("Sessão expirada/);
  });

  it("Trata 401 do servidor como sessão expirada", () => {
    expect(src).toMatch(/res\.status === 401/);
  });

  it("Não envia mais user_plano/user_id no body", () => {
    const callBlock = src.match(/await streamPlan\(\s*\{[\s\S]*?viagem:/);
    expect(callBlock?.[0]).toBeTruthy();
    expect(callBlock[0]).not.toMatch(/user_plano:/);
    expect(callBlock[0]).not.toMatch(/user_id:/);
  });
});
