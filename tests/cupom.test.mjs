// Smoke test: cupom validation
//
// Por que: R4-H2 revogou comissao_percent do column-grant → cupom.js
// que pedia essa coluna quebrou em produção (signup com cupom dead).
// R5-3 fixou. Também a R5-1 fechou wildcard ILIKE.
// Este test trava as duas regressões.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase ANTES de importar cupom.js
const mockSelect = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn();

vi.mock("../src/lib/supabase.js", () => ({
  supabase: {
    from: () => ({ select: mockSelect }),
  },
}));

mockSelect.mockImplementation(() => ({ eq: mockEq }));
mockEq.mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));

const { validateCupom } = await import("../src/lib/cupom.js");

beforeEach(() => {
  mockSelect.mockClear();
  mockEq.mockClear();
  mockMaybeSingle.mockClear();
});

describe("validateCupom", () => {
  it("rejeita cupom vazio", async () => {
    const r = await validateCupom("");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("vazio");
  });

  it("rejeita cupom só espaços", async () => {
    const r = await validateCupom("   ");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("vazio");
  });

  it("usa .eq (não .ilike) — defesa contra wildcard", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "x", ativo: true }, error: null });
    await validateCupom("TAYNARA10");
    // .eq foi chamado com "TAYNARA10" (uppercase)
    expect(mockEq).toHaveBeenCalledWith("cupom", "TAYNARA10");
  });

  it("normaliza pra UPPERCASE", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "x", ativo: true }, error: null });
    await validateCupom("taynara10");
    expect(mockEq).toHaveBeenCalledWith("cupom", "TAYNARA10");
  });

  it("NÃO pede comissao_percent (column revogada em R4-H2)", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "x", ativo: true }, error: null });
    await validateCupom("X");
    const selectArg = mockSelect.mock.calls[0][0];
    expect(selectArg).not.toMatch(/comissao_percent/);
  });

  it("retorna ok:true quando cupom ativo encontrado", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "af-1", nome: "Tay", cupom: "X", ativo: true, desconto_percent: 10 },
      error: null,
    });
    const r = await validateCupom("X");
    expect(r.ok).toBe(true);
    expect(r.afiliado.id).toBe("af-1");
  });

  it("retorna inativo quando ativo=false", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "x", ativo: false }, error: null,
    });
    const r = await validateCupom("X");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("inativo");
  });

  it("retorna nao_encontrado quando data=null", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const r = await validateCupom("X");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("nao_encontrado");
  });
});
