// Smoke tests R15 — friendlyError sanitiza tudo, nunca devolve message
// original do PostgREST/Supabase pro user.
//
// Cobre:
// - Códigos PG/PostgREST conhecidos
// - Strings de error
// - Objetos { code, message }
// - Network errors (Failed to fetch, AbortError, etc)
// - Auth errors (invalid credentials, user already registered)
// - Null/undefined/empty
// - Fallback genérico

import { describe, it, expect } from "vitest";
import { friendlyError, friendlyErrorWithContext } from "../src/lib/errorMessages.js";

describe("friendlyError — códigos PG/PostgREST", () => {
  it("23505 (unique violation) → 'Esse item já existe.'", () => {
    expect(friendlyError("23505")).toBe("Esse item já existe.");
    expect(friendlyError({ code: "23505", message: "duplicate key value violates" })).toBe("Esse item já existe.");
  });

  it("23503 (FK violation) → 'em outro lugar'", () => {
    expect(friendlyError({ code: "23503" })).toMatch(/em outro lugar/);
  });

  it("42501 (insufficient privilege) → 'permissão'", () => {
    expect(friendlyError({ code: "42501" })).toMatch(/permissão/);
  });

  it("PGRST116 (no rows) → 'Não encontrei'", () => {
    expect(friendlyError("PGRST116")).toMatch(/Não encontrei/);
    expect(friendlyError({ code: "PGRST116", message: "..." })).toMatch(/Não encontrei/);
  });

  it("PGRST301 (JWT expired) → 'sessão expirou'", () => {
    expect(friendlyError({ code: "PGRST301" })).toMatch(/sessão expirou/);
  });

  it("42P01 (undefined table) → 'Erro interno'", () => {
    expect(friendlyError({ code: "42P01", message: "relation does not exist" })).toMatch(/Erro interno/);
  });
});

describe("friendlyError — texto de mensagem (sem code)", () => {
  it("'duplicate key value' → unique violation msg", () => {
    expect(friendlyError(new Error("duplicate key value violates unique constraint viagem_pessoas_pkey"))).toBe("Esse item já existe.");
  });

  it("'permission denied for table afiliados' → permissão", () => {
    expect(friendlyError(new Error("permission denied for table afiliados"))).toMatch(/permissão/);
  });

  it("'violates row-level security policy' → permissão", () => {
    expect(friendlyError(new Error("new row violates row-level security policy"))).toMatch(/permissão/);
  });

  it("'foreign key constraint' → em outro lugar", () => {
    expect(friendlyError({ message: "violates foreign key constraint xxx" })).toMatch(/em outro lugar/);
  });

  it("'value too long' → texto muito longo", () => {
    expect(friendlyError({ message: "value too long for type character varying(50)" })).toBe("Texto muito longo.");
  });

  it("'jwt expired' → sessão expirou", () => {
    expect(friendlyError({ message: "JWT expired" })).toMatch(/sessão expirou/i);
  });
});

describe("friendlyError — network / fetch", () => {
  it("'Failed to fetch' → sem conexão", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/Sem conexão/);
  });

  it("AbortError → cancelada", () => {
    const err = new Error("The user aborted a request.");
    err.name = "AbortError";
    expect(friendlyError(err)).toMatch(/cancelada/);
  });

  it("timeout → demorou", () => {
    expect(friendlyError(new Error("Request timed out"))).toMatch(/demorou/);
  });

  it("ChunkLoadError → recarrega", () => {
    const err = new Error("Loading chunk 42 failed.");
    err.name = "ChunkLoadError";
    expect(friendlyError(err)).toMatch(/Recarrega|nova/);
  });
});

describe("friendlyError — Supabase Auth", () => {
  it("'Invalid login credentials' → email/senha", () => {
    expect(friendlyError(new Error("Invalid login credentials"))).toBe("Email ou senha incorretos.");
  });

  it("'User already registered' → email cadastrado", () => {
    expect(friendlyError({ message: "User already registered" })).toMatch(/já está cadastrado/);
  });

  it("'Email rate limit exceeded' → muitas tentativas", () => {
    expect(friendlyError({ message: "Email rate limit exceeded" })).toMatch(/Muitas tentativas/);
  });

  it("'Email not confirmed' → confirma email", () => {
    expect(friendlyError({ message: "Email not confirmed" })).toMatch(/Confirma seu email/);
  });

  it("code 'invalid_credentials' (sem mensagem) → email/senha", () => {
    expect(friendlyError({ code: "invalid_credentials" })).toBe("Email ou senha incorretos.");
  });
});

describe("friendlyError — defensivo contra null/undefined/empty", () => {
  it("null não crasha → fallback", () => {
    expect(friendlyError(null)).toMatch(/Algo deu errado/);
  });

  it("undefined → fallback", () => {
    expect(friendlyError(undefined)).toMatch(/Algo deu errado/);
  });

  it("string vazia → fallback", () => {
    expect(friendlyError("")).toMatch(/Algo deu errado/);
  });

  it("objeto vazio → fallback", () => {
    expect(friendlyError({})).toMatch(/Algo deu errado/);
  });

  it("erro com message desconhecido → fallback", () => {
    expect(friendlyError(new Error("foo bar baz xpto qwerty"))).toMatch(/Algo deu errado/);
  });

  it("string aleatória → fallback", () => {
    expect(friendlyError("random whatever")).toMatch(/Algo deu errado/);
  });
});

describe("friendlyError — NUNCA vaza message original", () => {
  // Cenários reais que estavam aparecendo no UI antes da R15.
  const SCHEMA_LEAKING = [
    "duplicate key value violates unique constraint viagem_pessoas_pkey",
    "permission denied for table afiliados",
    "new row violates row-level security policy for table \"comissoes\"",
    "relation \"public.afiliados\" does not exist",
    "null value in column \"user_id\" of relation \"viagens\" violates not-null constraint",
    "foreign key constraint \"viagem_membros_user_id_fkey\"",
  ];
  for (const raw of SCHEMA_LEAKING) {
    it(`não vaza: ${raw.slice(0, 50)}...`, () => {
      const sanitized = friendlyError(new Error(raw));
      // Nenhum nome de tabela / SQL keyword / coluna PG deve aparecer.
      expect(sanitized).not.toMatch(/viagem_pessoas|afiliados|comissoes|viagem_membros|null value|foreign key|relation/);
      expect(sanitized).not.toMatch(/public\.|_pkey|_fkey|constraint/);
      // Deve ser português curto.
      expect(sanitized.length).toBeLessThan(120);
      expect(sanitized).toMatch(/^[A-ZÀ-Ú]/); // começa com maiúscula
    });
  }
});

describe("friendlyErrorWithContext", () => {
  it("prefixa contexto + sanitiza erro", () => {
    const out = friendlyErrorWithContext("Não consegui salvar", new Error("duplicate key value"));
    expect(out).toBe("Não consegui salvar. Esse item já existe.");
  });

  it("remove ponto final duplicado do prefixo", () => {
    expect(friendlyErrorWithContext("Falhou!!!", { code: "PGRST116" })).toMatch(/^Falhou\. /);
  });

  it("sem prefixo → só friendlyError", () => {
    expect(friendlyErrorWithContext("", { code: "23505" })).toBe("Esse item já existe.");
  });
});
