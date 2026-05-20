// Smoke tests R37 — InfluencerStep destrava com timeout em vez de
// spinner infinito.
//
// Bug: etapa 2 do signup ("Quem te indicou?") mostrava spinner pra
// sempre quando supabase.from("afiliados").select(...) travava em
// Safari ITP. Stack trace confirmado via Playwright:
//   Storage.getItem ("viajjei.auth") → throw SecurityError
//   → supabase-js _emitInitialSession trava unhandled
//   → o .select() do PostgREST nunca dispara o request HTTP
//   → setLoading(false) nunca alcançado
//
// Fix: timeout de 5s no useEffect. Se a query não responder, destrava
// UI com error + botão "Pular" continua funcional. try/catch também
// pra cobrir throws síncronos.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const INFLUENCER = join(SRC, "pages/welcome/InfluencerStep.jsx");

describe("R37 — InfluencerStep timeout defensivo", () => {
  const src = readFileSync(INFLUENCER, "utf8");

  it("TIMEOUT_MS definido com valor ≤ 10s (UX razoável)", () => {
    const match = src.match(/const TIMEOUT_MS = (\d+)/);
    expect(match).toBeTruthy();
    const ms = Number(match[1]);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(10000);
  });

  it("setTimeout dispara setLoading(false) + setError se exceder", () => {
    const timeoutBlock = src.match(/setTimeout\(\(\) => \{[\s\S]+?\}, TIMEOUT_MS\)/);
    expect(timeoutBlock?.[0]).toBeTruthy();
    expect(timeoutBlock[0]).toMatch(/setLoading\(false\)/);
    expect(timeoutBlock[0]).toMatch(/setError\(/);
  });

  it("Mensagem de erro do timeout sugere usar botão Pular", () => {
    expect(src).toMatch(/pular esta etapa/i);
  });

  it("AbortController criado + ac.abort() chamado no timeout e cleanup", () => {
    expect(src).toMatch(/new AbortController\(\)/);
    const aborts = src.match(/ac\.abort\(\)/g) ?? [];
    expect(aborts.length).toBeGreaterThanOrEqual(2); // timeout + cleanup
  });

  it("Passa signal pro supabase via .abortSignal()", () => {
    expect(src).toMatch(/\.abortSignal\(ac\.signal\)/);
  });

  it("try/catch ao redor da query (cobre throw síncrono raro)", () => {
    // R39: query agora vai por runPublicQuery() em vez de supabase direto.
    // A regex precisa cobrir os dois (compatibilidade com refactors).
    expect(src).toMatch(/try\s*\{[\s\S]+?await\s+(supabase|runPublicQuery)[\s\S]+?\} catch \(e\)/);
  });

  it("Cleanup do effect cancela timer e abort", () => {
    const cleanupMatch = src.match(/return \(\) => \{[\s\S]+?\};/);
    expect(cleanupMatch?.[0]).toBeTruthy();
    expect(cleanupMatch[0]).toMatch(/active = false/);
    expect(cleanupMatch[0]).toMatch(/clearTimeout\(timeoutId\)/);
    expect(cleanupMatch[0]).toMatch(/ac\.abort\(\)/);
  });

  it("clearTimeout(timeoutId) também é chamado nos paths normais (success/error do supabase)", () => {
    // Anti-regressão: se o request resolver antes do timeout, ainda
    // precisa cancelar pra setError do timeout não disparar atrasado.
    const clears = src.match(/clearTimeout\(timeoutId\)/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(3); // try-success, try-err, catch
  });

  it("Botão Pular continua disponível no estado de error (não some)", () => {
    // O CTA "Ninguém me indicou — Pular" depende apenas de `!selected`,
    // não de loading/error. Confirma que nenhuma condição quebra isso.
    const skipBtnIdx = src.indexOf('Ninguém me indicou');
    expect(skipBtnIdx).toBeGreaterThan(-1);
    // O bloco do CTA não checa loading nem error
    const ctaSlice = src.slice(skipBtnIdx - 400, skipBtnIdx + 100);
    expect(ctaSlice).not.toMatch(/loading\s*&&|loading\s*\?/);
    expect(ctaSlice).not.toMatch(/error\s*&&|error\s*\?/);
  });

  it("console.warn no timeout pra rastrear em prod (telemetry leve)", () => {
    expect(src).toMatch(/console\.warn\(["'`]\[InfluencerStep\][^"'`]+timeout/);
  });
});
