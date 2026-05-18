// Smoke tests R17 — ConfirmModal v2 + useConfirm hook.
//
// Cobre:
// - ConfirmModal: variants info/confirm/danger, props back-compat,
//   acessibilidade (role=dialog, aria-modal, aria-labelledby, ESC,
//   focus trap), restauração de foco
// - useConfirm: Promise<boolean>, showConfirm/showAlert API,
//   ConfirmProvider montado em main.jsx
// - Anti-regressão: nenhum alert() ou confirm() nativo no src/
//
// Padrão string-based (vitest sem jsdom/RTL). Verifica que o código
// que IMPLEMENTA o comportamento existe. Não verifica runtime DOM.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const MODAL = join(SRC, "components/ConfirmModal.jsx");
const HOOK = join(SRC, "lib/useConfirm.jsx");
const MAIN = join(SRC, "main.jsx");

describe("R17-1 — ConfirmModal v2: variants + a11y", () => {
  const src = readFileSync(MODAL, "utf8");

  it("aceita prop 'variant' (nova API)", () => {
    expect(src).toMatch(/variant\b/);
    // Mapeamento variant → comportamento existe.
    expect(src).toMatch(/v === "danger"/);
    expect(src).toMatch(/isInfo|v === "info"/);
  });

  it("mantém prop 'confirmVariant' (back-compat)", () => {
    expect(src).toMatch(/confirmVariant/);
  });

  it("aceita 'message' como alias de 'body'", () => {
    expect(src).toMatch(/message \?\? body|body \?\? message/);
  });

  it("variant 'info' esconde botão de cancel", () => {
    // Renderiza só 1 botão (confirm) quando isInfo. Verifica via JSX
    // condicional `!isInfo && (`.
    expect(src).toMatch(/!isInfo\s*&&\s*\(/);
  });

  it("a11y: role=dialog + aria-modal + aria-labelledby", () => {
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=\{titleId\}/);
  });

  it("a11y: delega ESC/Tab/restore-focus pro hook useModalA11y", () => {
    // R18-2: imperativa de ESC, focus trap e restore foi extraída pro
    // hook compartilhado. ConfirmModal só importa o hook e aplica os
    // attrs/refs no JSX. Testes do hook em si vivem em R18-S.
    expect(src).toMatch(/import\s*\{\s*useModalA11y\s*\}\s*from\s*["']\.\.\/lib\/useModalA11y["']/);
    expect(src).toMatch(/useModalA11y\(\{/);
    expect(src).toMatch(/\{\s*dialogRef\s*,\s*titleId\s*\}\s*=\s*useModalA11y/);
  });

  it("a11y: foco inicial em cancel (não-destrutivo) ou no único botão em info", () => {
    // Passado pro hook via initialFocusRef. Logic local porque depende
    // de variant.
    expect(src).toMatch(/isInfo\s*\?\s*confirmBtnRef\s*:\s*cancelBtnRef/);
    expect(src).toMatch(/initialFocusRef/);
  });

  it("variant 'danger' aplica classe vermelha no botão confirm", () => {
    expect(src).toMatch(/bg-red-600.*hover:bg-red-700.*text-white/s);
  });

  it("backdrop click chama onClose (respeitando busy)", () => {
    expect(src).toMatch(/onClick=\{busy \? undefined : onClose\}/);
  });

  it("whitespace-pre-wrap pra mensagens multi-linha respeitarem \\n", () => {
    expect(src).toMatch(/whitespace-pre-wrap/);
  });
});

describe("R17-2 — useConfirm hook + ConfirmProvider", () => {
  const src = readFileSync(HOOK, "utf8");
  const main = readFileSync(MAIN, "utf8");

  it("exporta useConfirm e ConfirmProvider", () => {
    expect(src).toMatch(/export\s+function\s+useConfirm/);
    expect(src).toMatch(/export\s+function\s+ConfirmProvider/);
  });

  it("showConfirm retorna Promise (resolve com bool)", () => {
    expect(src).toMatch(/return new Promise\(\(resolve\)/);
    // Resolve com false em cancel.
    expect(src).toMatch(/onClose=\{\(\) => settle\(false\)\}/);
    // Resolve com true em confirm.
    expect(src).toMatch(/onConfirm=\{\(\) => settle\(true\)\}/);
  });

  it("showAlert wrappa showConfirm com variant='info' + OK label", () => {
    expect(src).toMatch(/showAlert/);
    expect(src).toMatch(/variant:\s*["']info["']/);
    expect(src).toMatch(/confirmLabel\s*\?\?\s*["']OK["']/);
  });

  it("concorrência: showConfirm chamado com modal aberto cancela o anterior", () => {
    // Resolvedor anterior é chamado com false antes de abrir o novo —
    // evita Promise órfã eternamente pendurada.
    expect(src).toMatch(/if \(resolverRef\.current\)/);
    expect(src).toMatch(/prev\(false\)/);
  });

  it("useConfirm lança erro se sem Provider", () => {
    expect(src).toMatch(/throw new Error\([^)]*ConfirmProvider/);
  });

  it("ConfirmProvider montado em main.jsx envolvendo App", () => {
    expect(main).toMatch(/import\s*\{\s*ConfirmProvider\s*\}\s*from\s*["']\.\/lib\/useConfirm["']/);
    expect(main).toMatch(/<ConfirmProvider>/);
    expect(main).toMatch(/<\/ConfirmProvider>/);
  });

  it("Provider está dentro de AuthProvider (ordem importa)", () => {
    // AuthProvider precisa ficar fora pra useAuth funcionar; Confirm
    // logo dentro pra ser visível em todas as rotas.
    const idxAuth = main.indexOf("<AuthProvider>");
    const idxConfirm = main.indexOf("<ConfirmProvider>");
    expect(idxAuth).toBeGreaterThan(-1);
    expect(idxConfirm).toBeGreaterThan(idxAuth);
  });
});

describe("R17-3/4 — anti-regressão: zero alert/confirm nativo no src/", () => {
  // Walk recursivo de todos os .js/.jsx em src/. Vitest sem fast-glob,
  // então readdirSync com recurse simples.
  function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(p));
      else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(p);
    }
    return out;
  }

  const files = walk(SRC);

  it("nenhum alert() nativo em código de runtime", () => {
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Regex: alert( não precedido por '.' (evita .alert), não em
      // comentário (linha começando com //), não em string literal
      // (heurística simples — string "alert(" em comentário/docstring
      // de safeHref.js que documenta XSS é OK).
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trim = line.trimStart();
        if (trim.startsWith("//") || trim.startsWith("*")) continue;
        // Match real chamada: identifier não-precedido por dot + abre paren
        if (/(^|[^.\w])alert\s*\(/.test(line) && !line.includes('"alert(')) {
          offenders.push(`${f.replace(SRC, "src")}:${i + 1} ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nenhum window.confirm() ou confirm() nativo em runtime", () => {
    const offenders = [];
    for (const f of files) {
      // Skip o próprio ConfirmModal e useConfirm (eles definem o sistema).
      if (f.endsWith("ConfirmModal.jsx") || f.endsWith("useConfirm.jsx")) continue;
      const src = readFileSync(f, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trim = line.trimStart();
        if (trim.startsWith("//") || trim.startsWith("*")) continue;
        // Identificador `confirm` chamado como função, NÃO precedido por
        // dot (filter showConfirm/setConfirm/onConfirm/etc) e NÃO no meio
        // de identifier maior (`confirmDelete`, `confirmCancel`).
        const m = line.match(/(^|[^.\w])confirm\s*\(/);
        if (m && !/\b(showConfirm|onConfirm|setConfirm|isConfirm|cancelConfirm|handleConfirm)\b/.test(line)) {
          offenders.push(`${f.replace(SRC, "src")}:${i + 1} ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("R17-S — exemplos de uso esperado nos call sites principais", () => {
  it("MyTrips.jsx — handleLogout usa showConfirm async", () => {
    const src = readFileSync(join(SRC, "pages/MyTrips.jsx"), "utf8");
    expect(src).toMatch(/const handleLogout = async/);
    expect(src).toMatch(/showConfirm\(\{/);
  });

  it("PlanChat.jsx — handleReset usa variant 'danger'", () => {
    const src = readFileSync(join(SRC, "components/PlanChat.jsx"), "utf8");
    const handleReset = src.match(/const handleReset[\s\S]+?\};/);
    expect(handleReset?.[0]).toMatch(/variant:\s*["']danger["']/);
  });

  it("Diario.jsx — deletePost usa variant 'danger'", () => {
    const src = readFileSync(join(SRC, "components/Diario.jsx"), "utf8");
    const block = src.match(/const deletePost[\s\S]+?\};/);
    expect(block?.[0]).toMatch(/variant:\s*["']danger["']/);
  });

  it("TripView.jsx — exportPdf usa showAlert", () => {
    const src = readFileSync(join(SRC, "pages/TripView.jsx"), "utf8");
    expect(src).toMatch(/showAlert\(friendlyError\(e\)/);
  });
});
