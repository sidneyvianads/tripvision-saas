// Smoke test: replace_day faz rollback quando INSERT falha (R8-4)
//
// Por que: roteiroParser.replace_day fazia DELETE-then-INSERT. Se o
// INSERT falhasse, o dia + atividades antigas sumiam pra sempre.
// O fix adicionou restore do prev_snapshot. Test estrutural valida
// que o código de rollback existe e está no fluxo correto.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARSER = resolve(__dirname, "../src/lib/roteiroParser.js");

describe("roteiroParser.replace_day rollback (R8-4)", () => {
  const src = readFileSync(PARSER, "utf8");

  it("captura snapshot ANTES do delete", () => {
    // prev_snapshot precisa estar atribuído antes do .delete()
    const replaceIdx = src.indexOf("case \"replace_day\"");
    expect(replaceIdx).toBeGreaterThan(-1);
    const segment = src.slice(replaceIdx, replaceIdx + 3500);
    // ordem: prevSnapshot atribuído → delete
    const snapshotIdx = segment.indexOf("prevSnapshot =");
    const deleteIdx = segment.indexOf(".delete().eq(\"id\", existingDiaId)");
    expect(snapshotIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(snapshotIdx).toBeLessThan(deleteIdx);
  });

  it("possui código de ROLLBACK no caminho de erro do INSERT", () => {
    // O fix adicionou re-INSERT do prev_snapshot quando dayErr.
    expect(src).toMatch(/rollback|prev_snapshot/i);
    // Bloco específico: detecta if (dayErr || !dayRow) seguido de
    // condicional com existingDiaId + prevSnapshot
    const rollbackBlock = src.match(/if\s*\(\s*dayErr\s*\|\|\s*!dayRow\s*\)\s*\{[\s\S]{0,800}?prevSnapshot\.dia[\s\S]{0,500}?\.insert/);
    expect(
      rollbackBlock,
      "Esperado bloco de rollback re-inserindo prevSnapshot.dia quando dayErr"
    ).toBeTruthy();
  });

  it("rolled_back flag aparece no result quando dayErr", () => {
    // results.push deve incluir rolled_back: true/false pra a UI saber
    expect(src).toMatch(/rolled_back\s*:/);
  });
});
