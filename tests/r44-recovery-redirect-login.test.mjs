// Smoke tests R44 — após reset no recovery, ir pro LOGIN (não entrar no app).
//
// Antes: updateUser com sucesso → sessão de recovery ativa → clearRecovering
// → App.jsx redirecionava /welcome → / (dashboard). O user entrava direto no
// app sem nunca confirmar a senha nova num login.
//
// Agora: após o updateUser dar certo no fluxo de recovery:
//   1. supabase.auth.signOut() — encerra a sessão de recovery (best-effort)
//   2. clearRecovering() — garante isRecovering=false (não bounce pro reset)
//   3. setMode("login") — mostra o LoginForm
//   4. mensagem verde "Senha atualizada! Faça login com sua nova senha."
//
// Robustez: durante recovery o useAuth NÃO carrega o profile / setUser (guard
// isRecoveringRef) — senão o USER_UPDATED do updateUser logaria o user no app
// numa corrida com o signOut.
//
// IMPORTANTE: a troca de senha DENTRO da conta (logado) NÃO é afetada — lá o
// user continua logado.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");

describe("R44 — Welcome.handleReset manda pro login após sucesso", () => {
  const src = readFileSync(join(SRC, "pages/Welcome.jsx"), "utf8");
  const fn = src.match(/const handleReset = async[\s\S]+?\n  \};/)[0];

  it("chama supabase.auth.signOut() no caminho de sucesso", () => {
    expect(fn).toMatch(/supabase\.auth\.signOut\(\)/);
  });

  it("signOut acontece ANTES do redirect pro login", () => {
    const idxSignOut = fn.indexOf("signOut(");
    const idxMode = fn.indexOf('setMode("login")');
    expect(idxSignOut).toBeGreaterThan(-1);
    expect(idxMode).toBeGreaterThan(idxSignOut);
  });

  it("redireciona pra tela de login (setMode('login'))", () => {
    expect(fn).toMatch(/setMode\("login"\)/);
  });

  it("mostra a mensagem de sucesso pedindo login com a senha nova", () => {
    expect(fn).toMatch(/Senha atualizada! Faça login com sua nova senha\./);
  });

  it("NÃO usa mais a mensagem antiga de 'Redirecionando' (que levava ao app)", () => {
    expect(fn).not.toMatch(/Redirecionando/);
  });

  it("signOut é best-effort (try/catch) pra não mascarar o sucesso da troca", () => {
    expect(fn).toMatch(/try \{ await supabase\.auth\.signOut\(\)/);
  });

  it("clearRecovering continua sendo chamado (isRecovering=false, sem bounce pro reset)", () => {
    expect(fn).toMatch(/clearRecovering\(\)/);
  });
});

describe("R44 — useAuth não loga o user durante recovery", () => {
  const src = readFileSync(join(SRC, "hooks/useAuth.jsx"), "utf8");

  it("tem um ref de recovery (espelho síncrono pro callback)", () => {
    expect(src).toMatch(/const isRecoveringRef = useRef\(false\)/);
  });

  it("PASSWORD_RECOVERY seta o ref true; SIGNED_OUT seta false", () => {
    const cb = src.slice(src.indexOf("onAuthStateChange("), src.indexOf("return () => {"));
    expect(cb).toMatch(/event === "PASSWORD_RECOVERY"[\s\S]*isRecoveringRef\.current = true/);
    expect(cb).toMatch(/event === "SIGNED_OUT"[\s\S]*isRecoveringRef\.current = false/);
  });

  it("o callback SAI cedo (sem loadProfile/setUser) quando recovery está ativo", () => {
    const cb = src.slice(src.indexOf("onAuthStateChange("), src.indexOf("return () => {"));
    // o guard precisa vir ANTES do setTimeout(loadProfile)
    const idxGuard = cb.indexOf("if (isRecoveringRef.current) return");
    const idxDefer = cb.indexOf("setTimeout(");
    expect(idxGuard).toBeGreaterThan(-1);
    expect(idxDefer).toBeGreaterThan(idxGuard);
  });

  it("clearRecovering também zera o ref (idempotente com SIGNED_OUT)", () => {
    expect(src).toMatch(/clearRecovering = useCallback\(\(\) => \{[\s\S]*isRecoveringRef\.current = false[\s\S]*setIsRecovering\(false\)/);
  });
});

describe("R44 — troca de senha DENTRO da conta NÃO desloga (intocada)", () => {
  const src = readFileSync(join(SRC, "pages/Account.jsx"), "utf8");
  const fn = src.match(/const handleChangePassword = async[\s\S]+?\n  \};/)[0];

  it("handleChangePassword NÃO chama signOut (user continua logado)", () => {
    expect(fn).not.toMatch(/signOut/);
  });

  it("handleChangePassword NÃO redireciona pra login nem navega pra fora", () => {
    expect(fn).not.toMatch(/setMode|navigate\(|window\.location/);
  });

  it("sucesso só mostra 'Senha atualizada!' e segue no app", () => {
    expect(fn).toMatch(/type: "ok", text: "Senha atualizada!"/);
  });
});
