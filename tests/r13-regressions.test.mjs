// Smoke tests R13 — anti-regressão pros 4 fixes de React 19 readiness +
// cleanup. Não são fixes de comportamento visível, são preparação pra
// concurrent rendering (transitions, Suspense suspend-then-resume).
//
// - R13-1: Date.now() durante render → useState lazy-init / state com tick
// - R13-2: GroupChat lastDay precomputado em useMemo (sem mutação)
// - R13-3: PlanChat welcome useMemo([trip]) e ShareModal canvasRef nas deps
// - R13-4: eslint.config.js permite underscore-prefix pra unused intencional

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tira comentários (//, /* */, JSX {/* */}) pra não contar Date.now()
// em comentários explicativos como se fossem chamadas reais.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const COUNTDOWN = resolve(__dirname, "../src/components/Countdown.jsx");
const DAYCARD = resolve(__dirname, "../src/components/DayCard.jsx");
const ADMIN_AF = resolve(__dirname, "../src/pages/AdminAfiliados.jsx");
const GROUPCHAT = resolve(__dirname, "../src/components/GroupChat.jsx");
const PLANCHAT = resolve(__dirname, "../src/components/PlanChat.jsx");
const SHARE_MODAL = resolve(__dirname, "../src/components/ShareModal.jsx");
const ESLINT_CFG = resolve(__dirname, "../eslint.config.js");

describe("R13-1 — Date.now() não chamado durante render (Countdown)", () => {
  const raw = readFileSync(COUNTDOWN, "utf8");
  const src = stripComments(raw);

  it("usa state 'now' em vez de Date.now() inline", () => {
    expect(src).toMatch(/const\s*\[\s*now\s*,\s*setNow\s*\]\s*=\s*useState/);
  });

  it("setInterval atualiza 'now' (não um tick contador inútil)", () => {
    // R25-2 refatorou pra `setInterval(tick, 60_000)` onde tick chama
    // setNow(Date.now()). Match aceita ambos: chamada inline OU via ref
    // a função tick que faz setNow.
    expect(src).toMatch(/setInterval\([\s\S]*?setNow\(Date\.now\(\)\)|const tick\s*=\s*\(\)\s*=>\s*setNow\(Date\.now\(\)\)/);
  });

  it("diff() recebe 'now' como parâmetro (não chama Date.now internamente)", () => {
    expect(src).toMatch(/function\s+diff\s*\(\s*target\s*,\s*now\s*\)/);
    const diffBody = src.match(/function\s+diff\s*\([^)]*\)\s*\{[\s\S]+?\n\}/);
    expect(diffBody?.[0]).toBeTruthy();
    expect(diffBody[0]).not.toMatch(/Date\.now\(\)/);
  });

  it("componente NÃO chama Date.now() durante render (só no lazy init e no interval)", () => {
    const compBody = src.slice(src.indexOf("export default function Countdown"));
    const matches = compBody.match(/Date\.now\(\)/g) ?? [];
    expect(matches.length).toBe(2);
  });
});

describe("R13-1 — Date.now() não chamado durante render (DayCard, AdminAfiliados)", () => {
  const dc = stripComments(readFileSync(DAYCARD, "utf8"));
  const af = stripComments(readFileSync(ADMIN_AF, "utf8"));

  it("DayCard usa mountedAt via useState lazy-init", () => {
    expect(dc).toMatch(/const\s*\[\s*mountedAt\s*\]\s*=\s*useState\(\s*\(\)\s*=>\s*Date\.now\(\)\s*\)/);
  });

  it("DayCard NÃO chama Date.now() inline no JSX", () => {
    expect(dc).toMatch(/getTime\(\)\s*-\s*mountedAt/);
    const matches = dc.match(/Date\.now\(\)/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("AdminAfiliados (UsuariosTab) usa mountedAt em vez de Date.now()", () => {
    expect(af).toMatch(/const\s*\[\s*mountedAt\s*\]\s*=\s*useState\(\s*\(\)\s*=>\s*Date\.now\(\)\s*\)/);
    // userStatus é arrow assigned, fim com };. Match não-greedy mais robusto.
    const userStatusBlock = af.match(/const\s+userStatus\s*=\s*\(u\)\s*=>\s*\{[\s\S]+?\n\s*\};/);
    expect(userStatusBlock?.[0]).toBeTruthy();
    expect(userStatusBlock[0]).not.toMatch(/Date\.now\(\)/);
    expect(userStatusBlock[0]).toMatch(/mountedAt/);
  });
});

describe("R13-2 — GroupChat lastDay sem mutação durante render", () => {
  const src = readFileSync(GROUPCHAT, "utf8");

  it("usa useMemo pra precomputar sepByMsgId (não let lastDay no escopo do componente)", () => {
    expect(src).toMatch(/const\s+sepByMsgId\s*=\s*useMemo/);
    // O .map dos messages NÃO deve mais reassignar lastDay.
    const mapBlock = src.match(/messages\.map\([\s\S]+?\)\)\}/);
    if (mapBlock) {
      expect(mapBlock[0]).not.toMatch(/lastDay\s*=/);
    }
  });

  it("showSep agora vem do map precomputado em vez de let mutado", () => {
    expect(src).toMatch(/const\s+showSep\s*=\s*sepByMsgId\[/);
  });
});

describe("R13-3 — PlanChat welcome useMemo([trip]) + ShareModal canvasRef nas deps", () => {
  const pc = readFileSync(PLANCHAT, "utf8");
  const sm = readFileSync(SHARE_MODAL, "utf8");

  it("PlanChat welcome useMemo depende de [trip] completo (não trip?.id)", () => {
    // Procura a useMemo do welcome — é precedida pela linha que chama
    // buildWelcomeMessage(trip).
    const block = pc.match(/const\s+welcome\s*=\s*useMemo[\s\S]+?\)\s*;/);
    expect(block?.[0]).toBeTruthy();
    // Deps devem ser apenas [trip], não [trip?.id].
    expect(block[0]).toMatch(/\}\)\s*,\s*\[\s*trip\s*\]\s*\)/);
    expect(block[0]).not.toMatch(/trip\?\.\s*id/);
  });

  it("ShareModal useEffect QR inclui canvasRef nas deps", () => {
    const block = sm.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]+?QRCode\.toCanvas[\s\S]+?\}\s*,\s*\[[^\]]+\]\)/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/\[\s*shareUrl\s*,\s*canvasRef\s*\]/);
  });
});

describe("R13-4 — eslint.config.js permite underscore-prefix pra unused intencional", () => {
  const src = readFileSync(ESLINT_CFG, "utf8");

  it("rules.no-unused-vars com argsIgnorePattern e varsIgnorePattern '^_'", () => {
    expect(src).toMatch(/argsIgnorePattern:\s*['"]\^_['"]/);
    expect(src).toMatch(/varsIgnorePattern:\s*['"]\^_['"]/);
    expect(src).toMatch(/caughtErrorsIgnorePattern:\s*['"]\^_['"]/);
  });
});
