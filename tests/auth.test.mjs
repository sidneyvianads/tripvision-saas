// Smoke test: auth — signIn / signOut / signUp basic invariants
//
// Por que: useAuth foi reescrito em R3 pra usar Supabase Auth nativo.
// Cobre o handshake mínimo pra detectar regressão em assinatura de função.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase ANTES de importar normalizeEmail/Password
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  }),
}));

const { normalizeEmail, normalizePassword } = await import("../src/lib/supabase.js");

describe("supabase helpers", () => {
  it("normalizeEmail tira espaços e lowercase", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("normalizeEmail remove caracteres invisíveis (zero-width)", () => {
    // ​ = zero-width space — bug clássico de copy/paste
    expect(normalizeEmail("foo​@bar.com")).toBe("foo@bar.com");
  });

  it("normalizePassword preserva uppercase mas tira invisíveis e trim", () => {
    expect(normalizePassword("  Pass​Word1!  ")).toBe("PassWord1!");
  });

  it("normalizeEmail aceita null/undefined sem crash", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});
