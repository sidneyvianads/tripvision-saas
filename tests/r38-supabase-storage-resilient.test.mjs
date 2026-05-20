// Smoke tests R38 — storage wrapper resiliente em supabase client.
//
// Bug: lista de afiliados não carregava nem em Chrome real (R37 timeout
// caía no fallback "Lista indisponível"). Causa: localStorage com JSON
// corrompido em "viajjei.auth" (de sessões anteriores) ou bloqueado
// (Safari ITP/quota cheia) fazia supabase-js travar em
// _emitInitialSession → toda query .from().select() ficava pendurada.
//
// Fix: storage wrapper que captura throws + valida JSON. Em caso de
// corrupção/bloqueio, cai pra in-memory Map. Side effect: session não
// persiste entre reloads quando storage falha, mas o app NÃO TRAVA.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const SUPA = join(SRC, "lib/supabase.js");

describe("R38 — supabase storage wrapper resiliente", () => {
  const src = readFileSync(SUPA, "utf8");

  it("storage NÃO é mais window.localStorage direto", () => {
    // Anti-regressão: se alguém voltar a passar window.localStorage cru,
    // o bug volta. Tem que ser o wrapper.
    expect(src).not.toMatch(/storage:\s*typeof window[\s\S]{0,80}window\.localStorage\s*:\s*undefined/);
    expect(src).toMatch(/storage:\s*resilientStorage/);
  });

  it("resilientStorage tem getItem/setItem/removeItem", () => {
    expect(src).toMatch(/const resilientStorage = typeof window/);
    expect(src).toMatch(/getItem\(key\)\s*\{/);
    expect(src).toMatch(/setItem\(key, value\)\s*\{/);
    expect(src).toMatch(/removeItem\(key\)\s*\{/);
  });

  it("getItem usa try/catch ao redor de localStorage.getItem", () => {
    const getItemBlock = src.match(/getItem\(key\)\s*\{[\s\S]+?\n  \},/);
    expect(getItemBlock?.[0]).toBeTruthy();
    expect(getItemBlock[0]).toMatch(/try\s*\{[\s\S]+?window\.localStorage\.getItem/);
    expect(getItemBlock[0]).toMatch(/catch \(e\)/);
  });

  it("getItem valida JSON pra chaves de auth (anti corrupção)", () => {
    // Pré-validação: parse o value ANTES de devolver pro supabase-js,
    // pra não contaminar _emitInitialSession.
    expect(src).toMatch(/key\.includes\(["']auth["']\)/);
    expect(src).toMatch(/JSON\.parse\(v\)/);
    expect(src).toMatch(/corrupted/i);
  });

  it("Fallback in-memory via Map quando storage explode", () => {
    expect(src).toMatch(/const memoryStore = new Map\(\)/);
    expect(src).toMatch(/memoryStore\.get\(key\)/);
    expect(src).toMatch(/memoryStore\.set\(key, value\)/);
    expect(src).toMatch(/memoryStore\.delete\(key\)/);
  });

  it("setItem catch também salva em memory (sessão durante a aba)", () => {
    const setItemBlock = src.match(/setItem\(key, value\)\s*\{[\s\S]+?\n  \},/);
    expect(setItemBlock?.[0]).toBeTruthy();
    expect(setItemBlock[0]).toMatch(/try\s*\{[\s\S]+?window\.localStorage\.setItem/);
    expect(setItemBlock[0]).toMatch(/catch \(e\)[\s\S]+?memoryStore\.set/);
  });

  it("removeItem é fire-and-forget (engole erros)", () => {
    const removeBlock = src.match(/removeItem\(key\)\s*\{[\s\S]+?\n  \},/);
    expect(removeBlock?.[0]).toBeTruthy();
    // try { localStorage.removeItem } catch {} — sem rethrow
    expect(removeBlock[0]).toMatch(/try\s*\{\s*window\.localStorage\.removeItem\(key\);\s*\}\s*catch\s*\{\}/);
  });

  it("console.warn em falhas pra rastrear em prod (telemetry leve)", () => {
    expect(src).toMatch(/\[supabase storage\]/);
  });

  it("createClient continua usando storageKey=viajjei.auth", () => {
    // Não trocamos a key — só o wrapper. Sessões existentes continuam compat.
    expect(src).toMatch(/storageKey:\s*["']viajjei\.auth["']/);
  });

  it("Auth options preservadas (persistSession + autoRefresh + detectSessionInUrl)", () => {
    expect(src).toMatch(/persistSession:\s*true/);
    expect(src).toMatch(/autoRefreshToken:\s*true/);
    expect(src).toMatch(/detectSessionInUrl:\s*true/);
  });
});
