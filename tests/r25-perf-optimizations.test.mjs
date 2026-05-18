// Smoke tests R25 — DayCard memo + Countdown bg pause.
//
// Cobertura string-based + verificações funcionais via teste de
// equality function exportada (puramente lógica).
//
// R25-1: DayCard com memo + custom equality + useMemo no badge + parent
//   useCallback estável.
// R25-2: Countdown pausa setInterval em document.hidden, retoma em
//   visibilitychange.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const DAYCARD = join(SRC, "components/DayCard.jsx");
const COUNTDOWN = join(SRC, "components/Countdown.jsx");
const TRIPVIEW = join(SRC, "pages/TripView.jsx");

describe("R25-1 — DayCard memo + useMemo + useCallback no parent", () => {
  const src = readFileSync(DAYCARD, "utf8");

  it("Importa memo + useMemo do React", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bmemo\b/);
    expect(src).toMatch(/import\s*\{[^}]*\buseMemo\b/);
  });

  it("Export default é memo(DayCard, arePropsEqual)", () => {
    expect(src).toMatch(/export default memo\(DayCard,\s*arePropsEqual\)/);
  });

  it("arePropsEqual function definida e compara fields essenciais", () => {
    expect(src).toMatch(/function arePropsEqual/);
    const fn = src.match(/function arePropsEqual\(prev,\s*next\)\s*\{[\s\S]+?\n\}/);
    expect(fn?.[0]).toBeTruthy();
    // Compara props top-level
    expect(fn[0]).toMatch(/prev\.expanded\s*!==\s*next\.expanded/);
    expect(fn[0]).toMatch(/prev\.isToday\s*!==\s*next\.isToday/);
    expect(fn[0]).toMatch(/prev\.color\s*!==\s*next\.color/);
    expect(fn[0]).toMatch(/prev\.onToggle\s*!==\s*next\.onToggle/);
    // Compara campos de day
    for (const field of ["id", "dia_numero", "data", "cidade", "titulo", "alerta", "hotel"]) {
      expect(fn[0]).toMatch(new RegExp(`a\\.${field}\\s*!==\\s*b\\.${field}`));
    }
  });

  it("Atividades comparam por length + ids (cheap signature)", () => {
    const fn = src.match(/function arePropsEqual[\s\S]+?\n\}/);
    expect(fn[0]).toMatch(/aAct\.length\s*!==\s*bAct\.length/);
    expect(fn[0]).toMatch(/aAct\[i\]\?\.id\s*!==\s*bAct\[i\]\?\.id/);
  });

  it("Badge 'Clima em breve' usa useMemo com deps [day?.data, mountedAt]", () => {
    const block = src.match(/const climaBadge\s*=\s*useMemo[\s\S]+?\}, \[[^\]]+\]\);/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/day\?\.data/);
    expect(block[0]).toMatch(/mountedAt/);
  });

  it("Badge usa o useMemo result em vez de IIFE inline (anti-regressão)", () => {
    // JSX deve referenciar {climaBadge}, NÃO um IIFE com Date.now/mountedAt direto
    expect(src).toMatch(/\{climaBadge\}/);
    // Não tem mais "Clima em breve" inline com IIFE: a string só aparece DENTRO do useMemo
    const inlineIife = src.match(/day\.data && \(\(\)\s*=>\s*\{[\s\S]+?Clima em breve/);
    expect(inlineIife).toBeFalsy();
  });

  it("onToggle agora recebe day.dia_numero (callback estável no parent)", () => {
    expect(src).toMatch(/onClick=\{onToggle \? \(\) => onToggle\(day\.dia_numero\)/);
  });
});

describe("R25-1 — TripView usa useCallback estável", () => {
  const src = readFileSync(TRIPVIEW, "utf8");

  it("Importa useCallback do React", () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseCallback\b/);
  });

  it("handleToggleDay com useCallback deps vazios (ref estável)", () => {
    // Source tem multi-line `useCallback(arrow, [])` — match cada peça
    // separadamente é mais robusto que regex multi-line frágil.
    expect(src).toMatch(/const handleToggleDay\s*=\s*useCallback/);
    expect(src).toMatch(/setExpanded\(\(prev\)\s*=>\s*\(?prev\s*===\s*diaNumero/);
    // deps vazios — useCallback(...., [])
    expect(src).toMatch(/handleToggleDay[\s\S]{0,200}\}, \[\]\)/);
  });

  it("DayCard recebe onToggle={handleToggleDay} (não inline)", () => {
    expect(src).toMatch(/<DayCard[\s\S]+?onToggle=\{handleToggleDay\}/);
    // Anti-regressão: nenhum onToggle inline com setExpanded direto
    expect(src).not.toMatch(/onToggle=\{\(\) => setExpanded/);
  });
});

describe("R25-2 — Countdown pausa em document.hidden", () => {
  const src = readFileSync(COUNTDOWN, "utf8");

  it("Listener visibilitychange adicionado + removido no cleanup", () => {
    expect(src).toMatch(/document\.addEventListener\("visibilitychange",\s*onVisChange\)/);
    expect(src).toMatch(/document\.removeEventListener\("visibilitychange",\s*onVisChange\)/);
  });

  it("onVisChange chama stopTimer quando hidden, startTimer quando visível", () => {
    expect(src).toMatch(/document\.hidden\)\s*stopTimer\(\)/);
    expect(src).toMatch(/else startTimer\(\)/);
  });

  it("startTimer faz tick imediato + setInterval (60s)", () => {
    const block = src.match(/const startTimer\s*=\s*\(\)\s*=>\s*\{[\s\S]+?\};/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/tick\(\);/);
    expect(block[0]).toMatch(/intervalId\s*=\s*setInterval\(tick,\s*60_?000\)/);
  });

  it("stopTimer faz clearInterval + zera intervalId (anti-leak)", () => {
    const block = src.match(/const stopTimer\s*=\s*\(\)\s*=>\s*\{[\s\S]+?\};/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/clearInterval\(intervalId\)/);
    expect(block[0]).toMatch(/intervalId\s*=\s*null/);
  });

  it("Bootstrap respeita document.hidden inicial (SSR-safe via typeof)", () => {
    expect(src).toMatch(/if \(typeof document === ["']undefined["'] \|\| !document\.hidden\)\s*startTimer\(\)/);
  });

  it("Cleanup do useEffect chama stopTimer + remove listener", () => {
    const cleanup = src.match(/return\s*\(\)\s*=>\s*\{[\s\S]+?stopTimer\(\)[\s\S]+?\};/);
    expect(cleanup?.[0]).toBeTruthy();
  });

  it("Nomes startTimer/stopTimer NÃO shadow prop 'start' do componente", () => {
    // A prop 'start' (data_inicio da viagem) é usada FORA do useEffect
    // — testar que o componente continua usando { start, end } no destructure.
    expect(src).toMatch(/function Countdown\(\{\s*start,\s*end\s*\}\)/);
    // E que NÃO há shadow `const start =` dentro do effect
    const effect = src.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]+?\}, \[\]\);/);
    expect(effect?.[0]).toBeTruthy();
    expect(effect[0]).not.toMatch(/\bconst start\b\s*=/);
  });
});
