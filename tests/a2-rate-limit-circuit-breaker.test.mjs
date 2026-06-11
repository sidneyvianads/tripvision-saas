// Smoke tests A2 — rate limiting com circuit breaker leve.
//
// Achado A2 da auditoria 2026-06-10: rateLimit era no-op sem Upstash e
// fail-open silencioso. A2 mantém fail-open (Padrão #14/#39 CRM: não derrubar
// o Jei se a infra de rate limit cair) MAS adiciona:
//   - circuit breaker: após N falhas, para de chamar o Upstash por um cooldown
//   - timeout curto (não pendurar a request até o teto da function)
//   - log ALTO ([rate-limit] upstash down, fail-open) pra visibilidade
//
// Limites reais ficam no caller (plan.mjs: 20/min userId + 60/min IP, dual-axis).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Importa o módulo com env do Upstash setado e fetch mockado, estado fresco.
async function loadWithUpstash(fetchMock) {
  vi.resetModules();
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
  vi.stubGlobal("fetch", fetchMock);
  return import("../netlify/functions/_lib/rate-limit.mjs");
}

const okResp = (count) => ({ ok: true, json: async () => [{ result: count }, { result: 1 }] });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("A2 — rate limit allow/block/janela", () => {
  it("LIBERA quando count <= limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(5));
    const { rateLimit } = await loadWithUpstash(fetchMock);
    const r = await rateLimit({ key: "plan:user:abc", limit: 20, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(15);
  });

  it("BLOQUEIA quando count > limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(21));
    const { rateLimit } = await loadWithUpstash(fetchMock);
    const r = await rateLimit({ key: "plan:user:abc", limit: 20, windowSec: 60 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("borda: count == limit libera, count == limit+1 bloqueia", async () => {
    const { rateLimit } = await loadWithUpstash(vi.fn().mockResolvedValue(okResp(20)));
    expect((await rateLimit({ key: "k", limit: 20, windowSec: 60 })).ok).toBe(true);
    const { rateLimit: rl2 } = await loadWithUpstash(vi.fn().mockResolvedValue(okResp(21)));
    expect((await rl2({ key: "k", limit: 20, windowSec: 60 })).ok).toBe(false);
  });

  it("janela deslizante: bucket muda com o tempo (key diferente)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(1));
    const { rateLimit } = await loadWithUpstash(fetchMock);
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(60_000); // bucket = floor(60 / 60) = 1
    await rateLimit({ key: "plan:user:abc", limit: 20, windowSec: 60 });
    nowSpy.mockReturnValue(120_000); // bucket = floor(120 / 60) = 2
    await rateLimit({ key: "plan:user:abc", limit: 20, windowSec: 60 });

    const keyOf = (callIdx) => JSON.parse(fetchMock.mock.calls[callIdx][1].body)[0][1];
    expect(keyOf(0)).not.toBe(keyOf(1));
    expect(keyOf(0)).toContain("rl:plan:user:abc:");
  });
});

describe("A2 — circuit breaker (fail-open + log alto)", () => {
  it("falha do Upstash NÃO bloqueia o caller (fail-open)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const { rateLimit } = await loadWithUpstash(fetchMock);
    const r = await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(r.error).toBe(true);
  });

  it("abre o circuit após 3 falhas e para de chamar o Upstash", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    const { rateLimit } = await loadWithUpstash(fetchMock);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1000);

    for (let i = 0; i < 3; i++) await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 4ª chamada: circuit aberto → fail-open SEM chamar fetch
    const r = await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(r.breakerOpen).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3); // não chamou de novo
  });

  it("half-open: após o cooldown, volta a tentar o Upstash e fecha ao recuperar", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    const { rateLimit } = await loadWithUpstash(fetchMock);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1000);
    for (let i = 0; i < 3; i++) await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // avança além do cooldown (30s) e Upstash recupera
    fetchMock.mockResolvedValue(okResp(2));
    nowSpy.mockReturnValue(1000 + 31_000);
    const r = await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    expect(fetchMock).toHaveBeenCalledTimes(4); // tentou de novo
    expect(r.ok).toBe(true);
    expect(r.breakerOpen).toBeUndefined(); // circuit fechado
  });

  it("loga ALTO quando o circuit abre (console.error com 'upstash down, fail-open')", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    const { rateLimit } = await loadWithUpstash(fetchMock);
    vi.spyOn(Date, "now").mockReturnValue(1000);
    for (let i = 0; i < 3; i++) await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    const logged = errSpy.mock.calls.flat().join(" ");
    expect(logged).toMatch(/upstash down, fail-open/);
    expect(logged).toMatch(/circuit ABERTO/);
  });

  it("timeout do Upstash conta como falha (fail-open)", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    const { rateLimit } = await loadWithUpstash(fetchMock);
    const r = await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(r.error).toBe(true);
  });
});

describe("A2 — stub mode preservado (sem Upstash)", () => {
  it("sem env do Upstash → no-op ok:true stub:true", async () => {
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { rateLimit } = await import("../netlify/functions/_lib/rate-limit.mjs");
    const r = await rateLimit({ key: "k", limit: 20, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(r.stub).toBe(true);
  });
});

describe("A2 — anti-regressão: plan.mjs dual-axis 20/min", () => {
  const planSrc = readFileSync(resolve(__dirname, "../netlify/functions/plan.mjs"), "utf8");
  it("mantém limite por userId (20) + IP (60) dual-axis", () => {
    expect(planSrc).toMatch(/RL_USER_LIMIT\s*=\s*20/);
    expect(planSrc).toMatch(/RL_IP_LIMIT\s*=\s*60/);
    expect(planSrc).toMatch(/plan:user:\$\{userId\}/);
    expect(planSrc).toMatch(/plan:ip:\$\{ip\}/);
  });
});
