// Smoke test: chat.mjs NÃO faz fallback pra SERVICE_KEY (R9-1)
//
// Por que: chat.mjs:21 fazia VITE_SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY.
// Se ANON faltar em prod, SERVICE vira a credencial usada em
// fetchUserPlan → bypass de RLS. Outras 5 functions fazem SERVICE || ANON
// porque legitimamente usam service-role.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAT = resolve(__dirname, "../netlify/functions/chat.mjs");

describe("chat.mjs SUPABASE_ANON_KEY sem fallback pra SERVICE", () => {
  const src = readFileSync(CHAT, "utf8");

  it("NÃO contém process.env.SUPABASE_SERVICE_KEY no fallback chain de SUPABASE_ANON_KEY", () => {
    // Encontra a linha da declaração
    const m = src.match(/const SUPABASE_ANON_KEY\s*=\s*([^;]+);/);
    expect(m, "Declaração de SUPABASE_ANON_KEY não encontrada").toBeTruthy();
    const fallbackChain = m[1];
    // chat.mjs só pode usar variantes de ANON, NUNCA SERVICE_KEY
    expect(
      fallbackChain,
      "chat.mjs não pode ter SERVICE_KEY no fallback de SUPABASE_ANON_KEY"
    ).not.toMatch(/SUPABASE_SERVICE_KEY/);
  });

  it("aceita VITE_SUPABASE_ANON_KEY como fonte primária", () => {
    expect(src).toMatch(/VITE_SUPABASE_ANON_KEY/);
  });
});
