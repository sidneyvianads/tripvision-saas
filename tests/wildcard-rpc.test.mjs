// Smoke test: AfiliadoPainel não pode vazar via cupom wildcard
//
// Por que (regressão da R4 detectada em R5): a RPC get_afiliado_panel
// usava ILIKE wildcard — atacante passava '%' e enumerava afiliados.
// Fix em R5-1: igualdade case-insensitive normalizada.
//
// Este teste roda contra Supabase REAL **se** SUPABASE_URL +
// SUPABASE_ANON_KEY estiverem disponíveis no env. Em CI puro sem
// secrets, valida apenas a sanitização de input.

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const HAS_SUPABASE = Boolean(URL && ANON);

// Sanitização do cupom (deve sair UPPERCASE, trim, max 30 chars, sem %_)
function normalizeCupom(raw) {
  return String(raw ?? "").trim().toUpperCase().slice(0, 30);
}

describe("cupom input sanitization (sempre roda)", () => {
  it("normalizeCupom NÃO escapa % — deve ser rejeitado depois", () => {
    // Aqui é só sanity: validateCupom passa o resultado pra .eq, que
    // trata % como literal. Mas é bom confirmar que normalize não filtra.
    expect(normalizeCupom("%")).toBe("%");
    expect(normalizeCupom("foo%bar")).toBe("FOO%BAR");
  });

  it("normalize aplica trim + uppercase", () => {
    expect(normalizeCupom(" taynara10 ")).toBe("TAYNARA10");
  });

  it("normalize limita a 30 chars", () => {
    expect(normalizeCupom("X".repeat(60))).toHaveLength(30);
  });
});

describe.skipIf(!HAS_SUPABASE)("get_afiliado_panel RPC (smoke real)", () => {
  it("'%' como cupom retorna NULL (não vaza)", async () => {
    const supa = createClient(URL, ANON);
    const { data } = await supa.rpc("get_afiliado_panel", { p_cupom: "%" });
    expect(data).toBeNull();
  });

  it("'%A%' não enumera afiliados", async () => {
    const supa = createClient(URL, ANON);
    const { data } = await supa.rpc("get_afiliado_panel", { p_cupom: "%A%" });
    expect(data).toBeNull();
  });

  it("string vazia retorna NULL", async () => {
    const supa = createClient(URL, ANON);
    const { data } = await supa.rpc("get_afiliado_panel", { p_cupom: "" });
    expect(data).toBeNull();
  });
});

// R7-2 smoke real: anon não tem GRANT SELECT em users — TODA leitura
// retorna 42501. Isso protege especificamente senha_hash + reset_code +
// stripe_customer_id (legado), mas também o resto. Pra co-membros
// (authenticated), só as 12 colunas inócuas são acessíveis — testar
// requer login real, fora do escopo deste smoke.
describe.skipIf(!HAS_SUPABASE)("users column-grant (R7-2 smoke real)", () => {
  for (const col of ["senha_hash", "reset_code", "stripe_customer_id", "mp_preapproval_id"]) {
    it(`${col} bloqueado pra anon (42501)`, async () => {
      const supa = createClient(URL, ANON);
      const { error } = await supa.from("users").select(col).limit(1);
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });
  }
});
