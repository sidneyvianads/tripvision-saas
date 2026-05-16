// Smoke test: UpgradeModal envia Authorization Bearer (R7-1)
//
// Por que: R4-H2 fez /api/create-subscription exigir JWT. Welcome.jsx
// e Account.jsx foram atualizados; UpgradeModal foi esquecido →
// upgrade pago quebrado em produção há ~3 rodadas. Sem teste, ninguém
// notou.
//
// Estratégia: ler o source do UpgradeModal e validar que ele faz
// supabase.auth.getSession() + Authorization header. Test estrutural,
// não E2E — suficiente pra trava de regressão.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPGRADE_MODAL = resolve(__dirname, "../src/components/UpgradeModal.jsx");
const ACCOUNT = resolve(__dirname, "../src/pages/Account.jsx");
const WELCOME = resolve(__dirname, "../src/pages/Welcome.jsx");

describe("UpgradeModal envia Authorization Bearer (R7-1)", () => {
  it("UpgradeModal.jsx chama supabase.auth.getSession antes do fetch create-subscription", () => {
    const src = readFileSync(UPGRADE_MODAL, "utf8");
    // Procura a função handleAssinar
    const handleAssinarIdx = src.indexOf("handleAssinar");
    expect(handleAssinarIdx).toBeGreaterThan(-1);

    // Recorta a função (até a próxima função ou close-of-component)
    const segment = src.slice(handleAssinarIdx, handleAssinarIdx + 2000);

    // Tem que ter getSession ANTES do fetch
    expect(segment).toMatch(/supabase\.auth\.getSession/);
    expect(segment).toMatch(/Authorization.*Bearer/);
  });

  it("os 3 call sites usam o mesmo padrão (Welcome + Account + UpgradeModal)", () => {
    // Anti-regressão genérica: o endpoint requires JWT, então TODOS
    // os clients devem ter o mesmo padrão.
    for (const file of [UPGRADE_MODAL, ACCOUNT, WELCOME]) {
      const src = readFileSync(file, "utf8");
      if (src.includes("/api/create-subscription") ||
          src.includes("/api/cancel-subscription") ||
          src.includes("/api/delete-account") ||
          src.includes("/api/export-user-data") ||
          src.includes("/api/delete-ia-history")) {
        // Se chama qualquer um desses endpoints JWT-required, precisa
        // ter Authorization Bearer no mesmo arquivo.
        expect(src, `${file} chama endpoint protegido sem Authorization Bearer`).toMatch(/Authorization.*Bearer/);
      }
    }
  });

  it("UpgradeModal NÃO manda userId/userEmail no body (servidor ignora)", () => {
    const src = readFileSync(UPGRADE_MODAL, "utf8");
    const handleAssinarIdx = src.indexOf("handleAssinar");
    const segment = src.slice(handleAssinarIdx, handleAssinarIdx + 2000);

    // userId/userEmail no body são bombas pendentes: dão a falsa impressão
    // de funcionar. Servidor ignora desde R4-H2. Test trava.
    const bodyMatch = segment.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/);
    expect(bodyMatch).toBeTruthy();
    expect(bodyMatch[0]).not.toMatch(/userId\s*:/);
    expect(bodyMatch[0]).not.toMatch(/userEmail\s*:/);
  });
});
