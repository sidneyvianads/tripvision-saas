// Smoke tests R24 — migração exportPdf de html2canvas+jspdf → pdf-lib.
//
// Cobre:
// - Lib nova: imports corretos, sanitize de emoji, API preservada
// - package.json: pdf-lib presente, html2canvas/jspdf removidos
// - TripView caller continua usando lazy import("../lib/exportPdf")
// - Anti-regressão: zero referência a html2canvas/jspdf em runtime

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const LIB = join(SRC, "lib/exportPdf.js");
const TRIPVIEW = join(SRC, "pages/TripView.jsx");
const PKG = resolve(__dirname, "../package.json");

describe("R24-2 — exportPdf reescrita com pdf-lib", () => {
  const src = readFileSync(LIB, "utf8");

  it("Importa pdf-lib (PDFDocument, StandardFonts, rgb, PageSizes)", () => {
    expect(src).toMatch(/from\s+["']pdf-lib["']/);
    expect(src).toMatch(/PDFDocument/);
    expect(src).toMatch(/StandardFonts/);
    expect(src).toMatch(/\brgb\b/);
    expect(src).toMatch(/PageSizes/);
  });

  it("NÃO importa html2canvas nem jsPDF", () => {
    expect(src).not.toMatch(/from\s+["']html2canvas["']/);
    expect(src).not.toMatch(/from\s+["']jspdf["']/);
    expect(src).not.toMatch(/import\s+jsPDF/);
  });

  it("Mantém API pública exportRoteiroPdf({ trip, days, contatos })", () => {
    expect(src).toMatch(/export async function exportRoteiroPdf\(\{\s*trip,\s*days,\s*contatos\s*=\s*\[\]\s*\}\)/);
  });

  it("PDFDocument.create + setTitle/setAuthor (metadata pra a11y)", () => {
    expect(src).toMatch(/PDFDocument\.create\(\)/);
    expect(src).toMatch(/\.setTitle\(/);
    expect(src).toMatch(/\.setAuthor\(/);
    expect(src).toMatch(/\.setSubject\(/);
  });

  it("Embed Helvetica + HelveticaBold (built-in, sem font extra)", () => {
    expect(src).toMatch(/StandardFonts\.Helvetica\b/);
    expect(src).toMatch(/StandardFonts\.HelveticaBold/);
  });

  it("A4 portrait via PageSizes.A4", () => {
    expect(src).toMatch(/PageSizes\.A4/);
  });

  it("sanitize remove emoji (Helvetica não tem glyph)", () => {
    // Função sanitize() filtra ranges Unicode de emoji
    expect(src).toMatch(/function sanitize/);
    expect(src).toMatch(/\\u\{1F000\}/);  // emoji range
    expect(src).toMatch(/\\u\{2600\}/);   // misc symbols
    expect(src).toMatch(/\\u\{1F300\}/);  // pictographs
  });

  it("wrapText pra text wrapping (pdf-lib não tem wrap nativo)", () => {
    expect(src).toMatch(/function wrapText/);
    expect(src).toMatch(/widthOfTextAtSize/);
    // Truncate com ellipsis quando excede maxLines
    expect(src).toMatch(/["']…["']|ellipsis/);
  });

  it("Logo PNG embedado via fetch + embedPng", () => {
    expect(src).toMatch(/fetchLogoPng/);
    expect(src).toMatch(/embedPng/);
    expect(src).toMatch(/\/logo-viajjei\.png/);
  });

  it("Helper hexToRgb01 converte cor do tema pra pdf-lib rgb 0-1", () => {
    expect(src).toMatch(/function hexToRgb01/);
    // pdf-lib quer 0..1, não 0..255
    expect(src).toMatch(/parseInt\(m\[1\], 16\) \/ 255/);
  });

  it("Footer com paginação em todas as páginas", () => {
    expect(src).toMatch(/drawFooters/);
    expect(src).toMatch(/getPageCount/);
    expect(src).toMatch(/pág \$\{i \+ 1\} de \$\{total\}/);
  });

  it("Filename inclui data ISO + slug", () => {
    expect(src).toMatch(/roteiro-\$\{[^}]+\}-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.pdf/);
  });

  it("Web Share API mobile path preservado", () => {
    expect(src).toMatch(/navigator\.canShare/);
    expect(src).toMatch(/navigator\.share/);
  });

  it("Fallback download via anchor (appendChild + click + remove + revokeObjectURL)", () => {
    expect(src).toMatch(/document\.createElement\("a"\)/);
    expect(src).toMatch(/document\.body\.appendChild\(a\)/);
    expect(src).toMatch(/a\.click\(\)/);
    expect(src).toMatch(/URL\.revokeObjectURL/);
  });

  it("Blob MIME application/pdf", () => {
    expect(src).toMatch(/new Blob\(\[pdfBytes\],\s*\{\s*type:\s*["']application\/pdf["']/);
  });
});

describe("R24-3 — package.json: pdf-lib in, html2canvas+jspdf out", () => {
  const pkg = JSON.parse(readFileSync(PKG, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  it("pdf-lib presente em dependencies", () => {
    expect(deps["pdf-lib"]).toBeTruthy();
  });

  it("html2canvas removido", () => {
    expect(deps["html2canvas"]).toBeUndefined();
  });

  it("jspdf removido", () => {
    expect(deps["jspdf"]).toBeUndefined();
  });
});

describe("R24 — TripView caller continua intacto + lazy", () => {
  const src = readFileSync(TRIPVIEW, "utf8");

  it("Importa exportRoteiroPdf via dynamic import() (lazy)", () => {
    expect(src).toMatch(/import\(\s*["']\.\.\/lib\/exportPdf["']\s*\)/);
  });

  it("Chama exportRoteiroPdf({ trip, days, contatos }) com mesma assinatura", () => {
    expect(src).toMatch(/exportRoteiroPdf\(\s*\{\s*trip,\s*days,\s*contatos:/);
  });
});

describe("R24 anti-regressão — zero html2canvas/jspdf em src + tests", () => {
  function walk(dir, exts = /\.(jsx?|mjs)$/) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(p, exts));
      else if (exts.test(entry.name)) out.push(p);
    }
    return out;
  }

  it("Nenhum arquivo runtime importa html2canvas", () => {
    const files = walk(SRC);
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Match real import, não menção em comentário/docstring
      if (/from\s+["']html2canvas["']|require\(["']html2canvas["']\)/.test(src)) {
        offenders.push(f.replace(SRC, "src"));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Nenhum arquivo runtime importa jspdf", () => {
    const files = walk(SRC);
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/from\s+["']jspdf["']|require\(["']jspdf["']\)/.test(src)) {
        offenders.push(f.replace(SRC, "src"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
