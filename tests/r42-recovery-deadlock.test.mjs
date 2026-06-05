// Smoke tests R42 — causa RAIZ do reset de senha que travava em produção.
//
// O R41 só deu feedback (timeout vira erro visível); o updateUser continuava
// travando de verdade. Reprodução e2e (Playwright Chromium E WebKit + node)
// achou a causa real, com evidência:
//
//   PUT /auth/v1/user → 200 em ~300ms (a senha É trocada no servidor!), mas
//   a Promise de updateUser() NUNCA resolvia. O R41 mascarava com o timeout
//   de 15s → "O servidor demorou demais pra atualizar a senha".
//
// Causa: DEADLOCK do lock interno do supabase-js (lock:viajjei.auth via
// navigator.locks). O supabase-js segura esse lock ENQUANTO executa os
// callbacks do onAuthStateChange. O callback do useAuth era `async` e
// chamava loadProfile() → supabase.from("users").select(), que re-entra no
// MESMO lock pra ler o token → trava esperando o lock que o updateUser
// segura. updateUser, por sua vez, só resolve depois de drenar os
// callbacks → deadlock circular.
//
// Isolado em node (cada caso com token de recovery real):
//   - SEM listener                              → updateUser resolve (~280ms)
//   - listener async SEM chamar supabase        → resolve (~250ms)
//   - listener async + supabase.from().select() → TRAVA pra sempre  ← o app
//   - listener com a chamada deferida (setTimeout 0) → resolve (~1.2s)
//
// Por que o LOGIN funcionava e só o recovery quebrava: signInWithPassword
// não bloqueia a própria resolução na drenagem do lock; updateUser bloqueia.
//
// Fix: o callback do onAuthStateChange ficou SÍNCRONO. Só faz trabalho que
// NÃO chama supabase (setState/Sentry/analytics). loadProfile é deferido
// via setTimeout(0), rodando DEPOIS do lock liberar. Padrão oficial do
// supabase-js. Validado e2e: Chromium e WebKit trocam a senha em ~550-720ms
// e redirecionam pra "/".

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");

// ---------------------------------------------------------------------------
// Parte 1 — modelo fiel do mecanismo de lock do supabase-js.
// Reproduz a semântica: o lock é segurado durante a notificação dos
// listeners, e uma re-aquisição (chamada reentrante) só resolve quando o
// detentor drena a fila. Demonstra o deadlock e que o defer o evita.
// ---------------------------------------------------------------------------
class FakeSupabaseLock {
  constructor() { this.locked = false; this.pending = []; this.listeners = []; }
  onAuthStateChange(fn) { this.listeners.push(fn); }
  async _withLock(fn) {
    if (this.locked) {
      // reentrante: enfileira; só roda quando o detentor drenar
      return new Promise((res, rej) => this.pending.push(() => Promise.resolve(fn()).then(res, rej)));
    }
    this.locked = true;
    try {
      const r = await fn();
      while (this.pending.length) { const w = this.pending.shift(); await w(); }
      return r;
    } finally { this.locked = false; }
  }
  // como .from().select(): precisa do lock pra ler o token
  query() { return this._withLock(async () => "rows"); }
  // como updateUser: notifica listeners DENTRO do lock, depois dreana
  updateUser() {
    return this._withLock(async () => {
      for (const l of this.listeners) await l("USER_UPDATED", { user: { id: "u1" } });
      return "updated";
    });
  }
}

const settlesWithin = async (promise, ms) => {
  const sentinel = Symbol("timeout");
  const r = await Promise.race([promise.then(() => "settled").catch(() => "settled"),
    new Promise((res) => setTimeout(() => res(sentinel), ms))]);
  return r !== sentinel;
};

describe("R42 — mecanismo do deadlock (modelo do lock do supabase-js)", () => {
  it("listener SÍNCRONO sem chamar supabase → updateUser resolve", async () => {
    const sb = new FakeSupabaseLock();
    sb.onAuthStateChange((event, session) => { /* só setState, nada de supabase */ });
    expect(await settlesWithin(sb.updateUser(), 300)).toBe(true);
  });

  it("listener async chamando supabase.query() DENTRO do callback → DEADLOCK (não resolve)", async () => {
    const sb = new FakeSupabaseLock();
    sb.onAuthStateChange(async (event, session) => { await sb.query(); }); // = o app antigo
    expect(await settlesWithin(sb.updateUser(), 300)).toBe(false); // trava
  });

  it("FIX: deferir a chamada supabase com setTimeout(0) → updateUser resolve", async () => {
    const sb = new FakeSupabaseLock();
    sb.onAuthStateChange((event, session) => { setTimeout(() => { sb.query(); }, 0); });
    expect(await settlesWithin(sb.updateUser(), 300)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Parte 2 — anti-regressão na fonte: o callback NÃO pode voltar a chamar
// supabase de forma síncrona.
// ---------------------------------------------------------------------------
describe("R42 — useAuth.onAuthStateChange blindado contra o deadlock", () => {
  const src = readFileSync(join(SRC, "hooks/useAuth.jsx"), "utf8");
  const cbStart = src.indexOf("onAuthStateChange(");
  const cbBlock = src.slice(cbStart, src.indexOf("return () => {", cbStart));

  it("o callback do onAuthStateChange NÃO é async (era 'async (event' e travava)", () => {
    expect(src).not.toMatch(/onAuthStateChange\(async\s*\(/);
    expect(src).toMatch(/onAuthStateChange\(\(event, session\) =>/);
  });

  it("loadProfile NÃO é chamado/aguardado direto no corpo do callback", () => {
    // antes: `const profile = await loadProfile(session.user)` no nível do callback
    // a única ocorrência de loadProfile no bloco precisa estar dentro de um setTimeout
    const idxLoad = cbBlock.indexOf("loadProfile");
    const idxDefer = cbBlock.indexOf("setTimeout(");
    expect(idxDefer).toBeGreaterThan(-1);
    expect(idxLoad).toBeGreaterThan(idxDefer); // loadProfile aparece DEPOIS do setTimeout(
  });

  it("a chamada supabase (loadProfile) é deferida via setTimeout(0)", () => {
    expect(cbBlock).toMatch(/setTimeout\(async \(\) => \{[\s\S]*loadProfile\(session\.user\)[\s\S]*\}, 0\)/);
  });

  it("o trabalho deferido respeita o guard `active` (não setState pós-unmount)", () => {
    const deferBlock = cbBlock.match(/setTimeout\(async \(\) => \{[\s\S]*?\}, 0\)/)[0];
    expect(deferBlock).toMatch(/if \(!active\) return/);
  });

  it("ramos síncronos seguros preservados (PASSWORD_RECOVERY / SIGNED_OUT)", () => {
    // esses NÃO chamam supabase — podem (e devem) continuar síncronos no callback
    expect(cbBlock).toMatch(/event === "PASSWORD_RECOVERY"[\s\S]*setIsRecovering\(true\)/);
    expect(cbBlock).toMatch(/event === "SIGNED_OUT" \|\| !session/);
  });

  it("comentário documenta a causa raiz (deadlock/lock) pra não regredir", () => {
    expect(src).toMatch(/deadlock/i);
    expect(src).toMatch(/lock/i);
    expect(src).toMatch(/R42/);
  });
});
