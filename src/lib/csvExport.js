// R19-6: helper pra gerar + baixar CSV no browser.
// Centraliza o boilerplate (escape de aspas, blob, anchor, revokeURL)
// que estava duplicado no AdminAfiliados.

// Escape CSV: aspas duplas viram "" (RFC 4180). Cell wrapped em "...".
function escapeCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/**
 * Gera CSV de matriz [[header...], [row1...], [row2...]] e dispara
 * download com o filename dado.
 *
 *   downloadCsv("afiliados-2026-05.csv", [
 *     ["Nome", "Cupom"],
 *     ["Sidney", "SIDNEY10"],
 *   ]);
 *
 * BOM ﻿ no início pra Excel BR abrir com acentos corretos sem
 * o user precisar configurar encoding.
 */
export function downloadCsv(filename, rows) {
  const csv = "﻿" + rows
    .map((r) => r.map(escapeCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
