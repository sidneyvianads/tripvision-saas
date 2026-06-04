// Smoke tests R41 — reset de senha não completava em produção.
//
// Sintoma (Sidney, 2 dias travado): link de recovery abria certo em
// viajjei.com.br/welcome#access_token=...&type=recovery, o app mostrava
// "Nova senha", o user preenchia as duas senhas (força: forte) e clicava
// "Atualizar senha" → NADA. Sem loading, sem erro, sem sucesso.
//
// Diagnóstico empírico (repro em node, ver abaixo) — DUAS causas:
//
//   1. HANG silencioso: supabase.auth.updateUser() faz
//      `await this.initializePromise` ANTES do timeout de lock interno
//      (5s). Se a hidratação do supabase-js travou (Safari ITP / storage
//      bloqueado — MESMO cenário do R36/R38), a initializePromise nunca
//      resolve → updateUser fica unsettled PRA SEMPRE. Sem erro, sem nada.
//      Repro confirmou: com um storage cujo getItem nunca resolve, o
//      updateUser não settla nem após 3s (o de lock nem chega a contar).
//      Contraste: SEM sessão (init ok) → updateUser devolve
//      AuthSessionMissingError em 0ms. Logo, "nada acontece" = HANG, não
//      sessão ausente.
//
//   2. SEM loading: updatePassword() não tocava o `loading`, e o botão
//      de reset lia justamente esse estado → spinner nunca aparecia.
//
// Fix:
//   - withTimeout() (lib/supabase.js): vira o hang infinito em rejeição
//     visível após N ms.
//   - updatePassword() (useAuth): getSession() com timeout garante sessão
//     ANTES do updateUser; updateUser também com timeout.
//   - Welcome.handleReset: estado local resetLoading (spinner) + finally.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");

// ---------------------------------------------------------------------------
// Parte 1 — comportamento REAL de withTimeout.
// Mockamos só o @supabase/supabase-js (createClient vira no-op) pra poder
// importar o módulo supabase.js sem efeito colateral de rede/boot, mas
// usando a implementação VERDADEIRA de withTimeout.
// ---------------------------------------------------------------------------
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: {}, from: () => ({}) }),
}));
const { withTimeout } = await import("../src/lib/supabase.js");

describe("R41 — withTimeout (transforma hang em erro visível)", () => {
  it("rejeita após `ms` quando a promise nunca resolve (o cenário do hang)", async () => {
    const nuncaResolve = new Promise(() => {}); // simula updateUser pendurado
    await expect(withTimeout(nuncaResolve, 20, "demorou demais")).rejects.toThrow("demorou demais");
  });

  it("o erro do timeout carrega flag isTimeout=true (checagem programática)", async () => {
    const nuncaResolve = new Promise(() => {});
    const err = await withTimeout(nuncaResolve, 20, "msg").catch((e) => e);
    expect(err.isTimeout).toBe(true);
  });

  it("NÃO usa name='TimeoutError' (senão friendlyError trocava pela msg genérica)", async () => {
    const err = await withTimeout(new Promise(() => {}), 20, "minha msg específica").catch((e) => e);
    expect(err.name).toBe("Error");
    expect(err.message).toBe("minha msg específica");
  });

  it("resolve normalmente quando a promise ganha do timeout", async () => {
    const rapida = Promise.resolve({ data: { session: { ok: true } } });
    await expect(withTimeout(rapida, 500, "nunca dispara")).resolves.toEqual({ data: { session: { ok: true } } });
  });

  it("propaga a rejeição original quando a promise rejeita antes do timeout", async () => {
    const falha = Promise.reject(new Error("erro real do supabase"));
    await expect(withTimeout(falha, 500, "timeout msg")).rejects.toThrow("erro real do supabase");
  });
});

// ---------------------------------------------------------------------------
// Parte 2 — wiring do fix nas fontes (anti-regressão estrutural).
// ---------------------------------------------------------------------------
describe("R41 — lib/supabase.js exporta withTimeout robusto", () => {
  const src = readFileSync(join(SRC, "lib/supabase.js"), "utf8");

  it("exporta withTimeout", () => {
    expect(src).toMatch(/export function withTimeout\(promise, ms, message\)/);
  });

  it("usa Promise.race + setTimeout e limpa o timer no finally (sem leak)", () => {
    expect(src).toMatch(/Promise\.race\(\[promise, timeout\]\)\.finally\(\(\) => clearTimeout\(timer\)\)/);
  });

  it("marca o erro com isTimeout = true", () => {
    expect(src).toMatch(/err\.isTimeout = true/);
  });
});

describe("R41 — useAuth.updatePassword blindado contra o hang", () => {
  const src = readFileSync(join(SRC, "hooks/useAuth.jsx"), "utf8");

  it("importa withTimeout do lib/supabase", () => {
    expect(src).toMatch(/import \{[^}]*withTimeout[^}]*\} from "\.\.\/lib\/supabase"/);
  });

  it("define timeouts pra getSession e updateUser", () => {
    expect(src).toMatch(/SESSION_CHECK_MS\s*=\s*\d+/);
    expect(src).toMatch(/UPDATE_USER_MS\s*=\s*\d+/);
  });

  it("getSession é chamado COM timeout ANTES do updateUser", () => {
    const fn = src.match(/const updatePassword = useCallback\(async[\s\S]+?\}, \[\]\);/);
    expect(fn?.[0]).toBeTruthy();
    const body = fn[0];
    const idxGetSession = body.indexOf("getSession");
    const idxUpdateUser = body.indexOf("updateUser");
    expect(idxGetSession).toBeGreaterThan(-1);
    expect(idxUpdateUser).toBeGreaterThan(idxGetSession); // sessão validada primeiro
    expect(body).toMatch(/withTimeout\(\s*supabase\.auth\.getSession\(\),\s*SESSION_CHECK_MS/);
    expect(body).toMatch(/withTimeout\(\s*supabase\.auth\.updateUser\(\{ password: clean \}\),\s*UPDATE_USER_MS/);
  });

  it("sem sessão → erro acionável (pedir novo link), não o cru do supabase", () => {
    const fn = src.match(/const updatePassword = useCallback\(async[\s\S]+?\}, \[\]\);/)[0];
    expect(fn).toMatch(/if \(!data\?\.session\)/);
    expect(fn).toMatch(/link de recuperação expirou ou já foi usado/i);
  });

  it("mensagem de timeout do getSession instrui abrir o link de novo", () => {
    expect(src).toMatch(/Abra de novo o link do email/i);
  });
});

describe("R41 — Welcome.handleReset com loading visível + finally", () => {
  const src = readFileSync(join(SRC, "pages/Welcome.jsx"), "utf8");

  it("tem estado local resetLoading (não depende do loading global)", () => {
    expect(src).toMatch(/const \[resetLoading, setResetLoading\] = useState\(false\)/);
  });

  it("handleReset liga resetLoading antes e desliga no finally", () => {
    const fn = src.match(/const handleReset = async[\s\S]+?\n  \};/)[0];
    expect(fn).toMatch(/setResetLoading\(true\)/);
    expect(fn).toMatch(/finally \{[\s\S]*setResetLoading\(false\)[\s\S]*\}/);
  });

  it("ResetPasswordForm recebe loading={resetLoading} (não o global)", () => {
    const block = src.match(/<ResetPasswordForm[\s\S]+?\/>/)[0];
    expect(block).toMatch(/loading=\{resetLoading\}/);
    expect(block).not.toMatch(/loading=\{loading\}/);
  });

  it("limpa info anterior ao reenviar (não deixa 'Defina sua nova senha' grudado)", () => {
    const fn = src.match(/const handleReset = async[\s\S]+?\n  \};/)[0];
    expect(fn).toMatch(/setInfo\(null\)/);
  });
});

// ---------------------------------------------------------------------------
// Parte 3 — friendlyError não engole as mensagens novas (UX real).
// As mensagens do updatePassword precisam CHEGAR no user. friendlyError
// faz passthrough só se: sem markers técnicos + com markers PT-BR.
// ---------------------------------------------------------------------------
describe("R41 — mensagens de erro do reset passam pelo friendlyError", () => {
  let friendlyError;
  beforeEach(async () => {
    ({ friendlyError } = await import("../src/lib/errorMessages.js"));
  });

  const MENSAGENS = [
    "Não consegui validar seu link de recuperação a tempo. Abra de novo o link do email e tente mais uma vez.",
    "Seu link de recuperação expirou ou já foi usado. Volte para Esqueci a senha e peça um novo.",
    "O servidor demorou demais pra atualizar a senha. Confira sua conexão e tente de novo.",
  ];

  for (const msg of MENSAGENS) {
    it(`preserva (ou melhora) a mensagem, nunca cai no fallback genérico: "${msg.slice(0, 32)}..."`, () => {
      const out = friendlyError(new Error(msg));
      expect(out).not.toBe("Algo deu errado. Tenta de novo em alguns segundos.");
      expect(out.length).toBeGreaterThan(0);
    });
  }
});
