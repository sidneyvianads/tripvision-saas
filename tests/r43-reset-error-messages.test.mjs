// Smoke tests R43 — mensagens claras de erro no reset de senha.
//
// Bug: no fluxo de recovery, tentar definir a senha IGUAL à atual fazia o
// servidor responder 422 same_password ("New password should be different
// from the old password."), mas o app mostrava o fallback genérico "Algo
// deu errado. Tenta de novo em alguns segundos." — o Sidney achou que
// estava quebrado e ficou horas em loop, quando o reset JÁ funcionava
// (PR #10 resolveu o deadlock).
//
// Duas causas no caminho:
//   1. updatePassword() jogava `new Error(error.message)` cru → perdia o
//      error.code ("same_password"), então o mapeamento por code não rodava.
//   2. friendlyError não tinha same_password mapeado → caía no fallback.
//
// Fix: (a) updatePassword preserva code/status; (b) PG_CODE_MAP + padrão de
// texto pra same_password; (c) friendlyResetError() pro contexto de recovery
// (sessão expirada → "peça um novo email"); (d) Account usa friendlyError
// pra consistência.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { friendlyError, friendlyResetError } from "../src/lib/errorMessages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");

const SAME_PW = "Essa já é a sua senha atual. Escolha uma senha diferente.";
const WEAK = "Senha muito fraca. Use 6+ caracteres com letras e números.";
const LINK_EXPIRED = "Seu link de recuperação expirou. Volte e peça um novo email de redefinição.";
const RATE = "Muitas tentativas. Espera 1 minuto.";
const FALLBACK = "Algo deu errado. Tenta de novo em alguns segundos.";

// shape real do que o updateUser devolve (AuthApiError) e do que
// updatePassword re-lança (Error com .code/.status preservados)
const samePwError = { code: "same_password", status: 422, message: "New password should be different from the old password." };

describe("R43 — friendlyError mapeia os erros do updateUser", () => {
  it("same_password por CODE → mensagem clara (não cai no fallback)", () => {
    expect(friendlyError(samePwError)).toBe(SAME_PW);
    expect(friendlyError(samePwError)).not.toBe(FALLBACK);
  });

  it("same_password por MENSAGEM (se o code se perder) → mesma mensagem", () => {
    expect(friendlyError(new Error("New password should be different from the old password."))).toBe(SAME_PW);
    expect(friendlyError(new Error("New password should be different from the old password."))).not.toBe(FALLBACK);
  });

  it("weak_password → mensagem clara", () => {
    expect(friendlyError({ code: "weak_password", status: 422, message: "Password should be at least 6 characters." })).toBe(WEAK);
  });

  it("rate limit (over_request_rate_limit / 429) → mensagem clara", () => {
    expect(friendlyError({ code: "over_request_rate_limit", status: 429, message: "Request rate limit reached" })).toBe(RATE);
  });

  it("regressão: o exato erro que confundiu o Sidney não retorna mais o genérico", () => {
    // antes do R43 isto retornava FALLBACK
    expect(friendlyError(samePwError)).not.toBe(FALLBACK);
  });
});

describe("R43 — friendlyResetError (contexto recovery)", () => {
  it("same_password → mensagem clara (delegada ao friendlyError)", () => {
    expect(friendlyResetError(samePwError)).toBe(SAME_PW);
  });

  it("weak_password → mensagem clara", () => {
    expect(friendlyResetError({ code: "weak_password", message: "weak password" })).toBe(WEAK);
  });

  it("sessão expirada por CODE (session_not_found) → fala em LINK, não em login", () => {
    expect(friendlyResetError({ code: "session_not_found", message: "Session from session_id claim in JWT does not exist" })).toBe(LINK_EXPIRED);
  });

  it("'Auth session missing' → mensagem de link expirado", () => {
    expect(friendlyResetError(new Error("Auth session missing!"))).toBe(LINK_EXPIRED);
  });

  it("jwt expired → mensagem de link expirado (contexto recovery)", () => {
    expect(friendlyResetError(new Error("JWT expired"))).toBe(LINK_EXPIRED);
  });

  it("rate limit → mensagem clara (delegada)", () => {
    expect(friendlyResetError({ code: "over_request_rate_limit", status: 429, message: "rate limit" })).toBe(RATE);
  });

  it("timeout do R41 (isTimeout) → preserva a mensagem original, não sobrescreve", () => {
    const timeoutErr = Object.assign(new Error("O servidor demorou demais pra atualizar a senha. Confira sua conexão e tente de novo."), { isTimeout: true });
    const out = friendlyResetError(timeoutErr);
    expect(out).toMatch(/demorou demais pra atualizar a senha/i);
    expect(out).not.toBe(LINK_EXPIRED);
  });

  it("erro desconhecido → cai no fallback genérico (comportamento atual mantido)", () => {
    expect(friendlyResetError(new Error("kaboom interno inesperado xyz"))).toBe(FALLBACK);
  });
});

describe("R43 — wiring na fonte", () => {
  it("updatePassword preserva error.code e error.status ao re-lançar", () => {
    const src = readFileSync(join(SRC, "hooks/useAuth.jsx"), "utf8");
    const fn = src.match(/const updatePassword = useCallback\(async[\s\S]+?\}, \[\]\);/)[0];
    expect(fn).toMatch(/e\.code = error\.code/);
    expect(fn).toMatch(/e\.status = error\.status/);
    // não pode voltar a jogar o Error cru sem code
    expect(fn).not.toMatch(/if \(error\) throw new Error\(error\.message\);/);
  });

  it("Welcome.handleReset usa friendlyResetError (não o genérico)", () => {
    const src = readFileSync(join(SRC, "pages/Welcome.jsx"), "utf8");
    expect(src).toMatch(/import \{[^}]*friendlyResetError[^}]*\} from "\.\.\/lib\/errorMessages"/);
    const fn = src.match(/const handleReset = async[\s\S]+?\n  \};/)[0];
    expect(fn).toMatch(/setErr\(friendlyResetError\(e\)\)/);
  });

  it("Account.handleChangePassword trata same_password sem 'erro de rede'", () => {
    const src = readFileSync(join(SRC, "pages/Account.jsx"), "utf8");
    const fn = src.match(/const handleChangePassword = async[\s\S]+?\n  \};/)[0];
    expect(fn).toMatch(/err\.code === "same_password"/);
    expect(fn).toMatch(/friendlyError\(err\)/);
    // não vaza mais a mensagem técnica crua nem rotula tudo como erro de rede
    expect(fn).not.toMatch(/erro de rede\)\. Sua senha atual continua válida\. Tente de novo: \$\{err\.message\}/);
  });
});
