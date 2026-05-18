// Smoke tests R18 — useModalA11y hook + a11y attrs nos 4 modais.
//
// Padrão string-based (vitest sem jsdom). Verifica que:
// 1. Hook tem signature + lógica esperada
// 2. ConfirmModal já delega pro hook (R18-2 anti-regressão)
// 3. ShareModal, People, AfiliadoForm, UpgradeModal têm role=dialog +
//    aria-modal + aria-labelledby + dialogRef + initialFocusRef sensato
// 4. UpgradeModal tem locked={!!busy} pra mid-payment

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");

const HOOK = join(SRC, "lib/useModalA11y.js");
const CONFIRM = join(SRC, "components/ConfirmModal.jsx");
const SHARE = join(SRC, "components/ShareModal.jsx");
const PEOPLE = join(SRC, "components/People.jsx");
const UPGRADE = join(SRC, "components/UpgradeModal.jsx");
const AFILIADOS = join(SRC, "pages/AdminAfiliados.jsx");

describe("R18-1 — useModalA11y hook", () => {
  const src = readFileSync(HOOK, "utf8");

  it("exporta useModalA11y", () => {
    expect(src).toMatch(/export function useModalA11y/);
  });

  it("retorna { dialogRef, titleId }", () => {
    expect(src).toMatch(/return\s*\{\s*dialogRef\s*,\s*titleId\s*\}/);
  });

  it("usa useId pra titleId único", () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseId\b/);
    expect(src).toMatch(/titleId\s*=\s*useId\(\)/);
  });

  it("ESC dispara onClose (respeitando locked)", () => {
    expect(src).toMatch(/e\.key === "Escape"/);
    expect(src).toMatch(/if \(locked\) return/);
    expect(src).toMatch(/onClose\?\.\(\)/);
  });

  it("focus trap em Tab (cycle entre first/last focável)", () => {
    expect(src).toMatch(/e\.key === "Tab"/);
    expect(src).toMatch(/e\.shiftKey/);
    expect(src).toMatch(/document\.activeElement === first/);
    expect(src).toMatch(/document\.activeElement === last/);
  });

  it("foco inicial: initialFocusRef se passado, senão primeiro focável", () => {
    expect(src).toMatch(/initialFocusRef\?\.current/);
    expect(src).toMatch(/focusables\[0\]\?\.focus\(\)/);
  });

  it("restore focus no elemento que abriu modal", () => {
    expect(src).toMatch(/prevFocusRef\.current\s*=\s*[^;]*activeElement/);
    expect(src).toMatch(/prev\.focus\(\)/);
  });

  it("cleanup remove listener + clearTimeout", () => {
    expect(src).toMatch(/window\.removeEventListener\("keydown"/);
    expect(src).toMatch(/clearTimeout\(t\)/);
  });

  it("getFocusables filtra inputs hidden e tabindex=-1", () => {
    expect(src).toMatch(/input:not\(\[disabled\]\):not\(\[type="hidden"\]\)/);
    expect(src).toMatch(/tabindex\]:not\(\[tabindex="-1"\]\)/);
  });

  it("getFocusables aceita textarea/select/href (focáveis comuns)", () => {
    expect(src).toMatch(/textarea/);
    expect(src).toMatch(/select/);
    expect(src).toMatch(/\[href\]/);
  });

  it("restore focus dentro de try/catch (elemento pode sumir mid-cleanup)", () => {
    // try { prev.focus(); } catch { ... }
    expect(src).toMatch(/try\s*\{\s*prev\.focus\(\)/);
  });
});

describe("R18-2 — ConfirmModal delega pro hook (anti-regressão)", () => {
  const src = readFileSync(CONFIRM, "utf8");

  it("importa e usa useModalA11y", () => {
    expect(src).toMatch(/import\s*\{\s*useModalA11y\s*\}\s*from\s*["']\.\.\/lib\/useModalA11y["']/);
    expect(src).toMatch(/useModalA11y\(\{/);
  });

  it("não duplica lógica de keydown/focus trap (movida pro hook)", () => {
    // No nível do componente, NÃO deve mais haver e.key === "Escape" ou Tab
    // dentro de useEffect — esses caíram pro hook.
    expect(src).not.toMatch(/e\.key === "Escape"/);
    expect(src).not.toMatch(/e\.key === "Tab"/);
  });

  it("ainda aplica role/aria-modal/aria-labelledby no JSX", () => {
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=\{titleId\}/);
  });
});

describe("R18-3 — ShareModal a11y", () => {
  const src = readFileSync(SHARE, "utf8");

  it("importa useModalA11y", () => {
    expect(src).toMatch(/import\s*\{\s*useModalA11y\s*\}/);
  });

  it("aplica role=dialog + aria-modal + aria-labelledby", () => {
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=\{titleId\}/);
  });

  it("dialog tem h2 id={titleId} pro título 'Compartilhar viagem'", () => {
    expect(src).toMatch(/<h2 id=\{titleId\}[^>]*>Compartilhar viagem<\/h2>/);
  });

  it("ref={dialogRef} no container interno", () => {
    expect(src).toMatch(/ref=\{dialogRef\}/);
  });

  it("foco inicial vai pro email input quando initialTab='email'", () => {
    expect(src).toMatch(/initialFocusRef:\s*initialTab\s*===\s*["']email["']\s*\?\s*emailInputRef/);
  });

  it("emailInputRef chega no input email do EmailPanel via prop", () => {
    // EmailPanel recebe emailInputRef e aplica no <input ref={emailInputRef}>
    expect(src).toMatch(/function EmailPanel\(\{[^}]*emailInputRef/);
    expect(src).toMatch(/ref=\{emailInputRef\}/);
  });

  it("backdrop tem role=presentation (screen reader ignora)", () => {
    expect(src).toMatch(/role="presentation"/);
  });
});

describe("R18-3 — People a11y", () => {
  const src = readFileSync(PEOPLE, "utf8");

  it("importa useModalA11y", () => {
    expect(src).toMatch(/import\s*\{\s*useModalA11y\s*\}/);
  });

  it("aplica role=dialog + aria-modal + aria-labelledby", () => {
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=\{titleId\}/);
  });

  it("h2 id={titleId} pro título 'Quem vai'", () => {
    expect(src).toMatch(/<h2 id=\{titleId\}[^>]*>Quem vai<\/h2>/);
  });

  it("foco inicial no botão Convidar quando isAdmin", () => {
    expect(src).toMatch(/initialFocusRef:\s*isAdmin\s*\?\s*inviteBtnRef/);
  });

  it("inviteBtnRef aplicado no botão Convidar", () => {
    expect(src).toMatch(/ref=\{inviteBtnRef\}/);
  });

  it("emoji decorativo ❄️ tem aria-hidden", () => {
    expect(src).toMatch(/aria-hidden="true"[^>]*>❄️|❄️[\s\S]*?aria-hidden="true"/);
  });
});

describe("R18-3 — AfiliadoForm a11y", () => {
  const src = readFileSync(AFILIADOS, "utf8");

  it("importa useModalA11y", () => {
    expect(src).toMatch(/import\s*\{\s*useModalA11y\s*\}/);
  });

  it("AfiliadoForm tem role=dialog + aria-modal + aria-labelledby", () => {
    const afForm = src.match(/function AfiliadoForm[\s\S]+?^\}/m);
    expect(afForm?.[0]).toBeTruthy();
    expect(afForm[0]).toMatch(/role="dialog"/);
    expect(afForm[0]).toMatch(/aria-modal="true"/);
    expect(afForm[0]).toMatch(/aria-labelledby=\{titleId\}/);
  });

  it("foco inicial no input Nome (primeiro campo)", () => {
    const afForm = src.match(/function AfiliadoForm[\s\S]+?^\}/m);
    expect(afForm[0]).toMatch(/nomeInputRef/);
    expect(afForm[0]).toMatch(/initialFocusRef:\s*nomeInputRef/);
    // Ref aplicado no input Nome
    expect(afForm[0]).toMatch(/ref=\{nomeInputRef\}[\s\S]*?placeholder="Nome\*"/);
  });

  it("X close tem aria-label='Fechar'", () => {
    const afForm = src.match(/function AfiliadoForm[\s\S]+?^\}/m);
    expect(afForm[0]).toMatch(/aria-label="Fechar"/);
  });
});

describe("R18-4 — UpgradeModal locked durante mid-payment", () => {
  const src = readFileSync(UPGRADE, "utf8");

  it("importa useModalA11y", () => {
    expect(src).toMatch(/import\s*\{\s*useModalA11y\s*\}/);
  });

  it("aplica role=dialog + aria-modal + aria-labelledby", () => {
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=\{titleId\}/);
  });

  it("locked={!!busy} passado pro hook", () => {
    expect(src).toMatch(/const locked\s*=\s*!!busy/);
    expect(src).toMatch(/useModalA11y\(\{[\s\S]*?locked\b/);
  });

  it("backdrop click respeita locked", () => {
    expect(src).toMatch(/onClick=\{locked \? undefined : onClose\}/);
  });

  it("X close disabled quando locked", () => {
    expect(src).toMatch(/disabled=\{locked\}/);
  });

  it("h2 id={titleId} pro heading", () => {
    expect(src).toMatch(/<h2 id=\{titleId\}[^>]*>\{heading\}<\/h2>/);
  });
});
