// Smoke test: reconcile usa janela por ciclo (R9-4) + fail-CLOSED 4xx (R9-5)
//
// Por que (R9-4): R8-6 hardcoded janela=35d. Anual paga 1×/ano, last
// approved sempre >35d → reconcile NUNCA estendia anual. Webhook
// renovação falhar = anual fiel perde acesso.
//
// Por que (R9-5): R8-6 fail-OPEN em qualquer !ok. 401 (token rotacionado)
// = fail-open extende 200 subs sem validar. Agora 4xx = fail-CLOSED.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECONCILE = resolve(__dirname, "../netlify/functions/reconcile-subscriptions.mjs");

describe("reconcile janela por ciclo + fail-mode (R9-4 + R9-5)", () => {
  const src = readFileSync(RECONCILE, "utf8");

  it("R9-4: usa cutoff diferenciado por sub.ciclo === 'anual'", () => {
    // Procura algo como `ciclo === "anual" ? 380 : 35` na chamada de
    // temCobrancaAprovadaRecente.
    expect(src).toMatch(/ciclo\s*===\s*["']anual["']\s*\?\s*380/);
  });

  it("R9-4: cutoff anual >= 365 dias (cobre 1 ciclo completo)", () => {
    // Procura número >= 365 perto de 'anual'
    const segment = src.match(/ciclo[\s\S]{0,40}["']anual["']\s*\?\s*(\d+)/);
    expect(segment).toBeTruthy();
    const days = Number(segment[1]);
    expect(days).toBeGreaterThanOrEqual(365);
  });

  it("R9-5 + R10-5: distingue 4xx permanente (fail-CLOSED) de 5xx/429 (fail-OPEN)", () => {
    // Bloco temCobrancaAprovadaRecente deve checar res.status >= 400 && < 500
    // E excluir 429 (rate-limit transient).
    expect(src).toMatch(/res\.status\s*>=\s*400\s*&&\s*res\.status\s*<\s*500\s*&&\s*res\.status\s*!==\s*429/);
  });

  it("R9-5: 4xx chama captureMessage com level 'error'", () => {
    const segment = src.match(/res\.status\s*>=\s*400[\s\S]{0,500}/);
    expect(segment).toBeTruthy();
    expect(segment[0]).toMatch(/captureMessage[\s\S]{0,80}["']error["']/);
  });
});
