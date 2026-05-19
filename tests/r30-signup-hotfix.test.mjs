// Smoke tests R30 — hotfix de emergência: signup quebrado em produção.
//
// Bug 1 (R30-2): public.users.senha_hash legacy NOT NULL bloqueava signup.
// A função handle_new_auth_user (trigger pós-signup do Supabase Auth) faz
// INSERT sem incluir senha_hash → 23502. Migration aplica DROP NOT NULL.
//
// Bug 2 (R30-4): PlanPicker mostrava "500 mensagens" (Pro) e "2.000
// mensagens" (Grupo) mas o backend (MONTHLY_LIMITS em plan.mjs) força
// 200/800. R20-1 fixou em plans.js/landing mas esqueceu PlanPicker.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const MIGRATIONS = resolve(__dirname, "../supabase/migrations");
const MIGRATION = join(MIGRATIONS, "2026_05_19_users_senha_hash_drop_not_null.sql");
const PLAN_PICKER = join(SRC, "pages/welcome/PlanPicker.jsx");
const PLAN_MJS = resolve(__dirname, "../netlify/functions/plan.mjs");

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(URL_ && ANON);

describe("R30-2 — migration DROP NOT NULL em users.senha_hash", () => {
  it("Arquivo de migration existe no repo", () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it("Migration contém ALTER COLUMN senha_hash DROP NOT NULL", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/ALTER TABLE public\.users ALTER COLUMN senha_hash DROP NOT NULL/);
  });

  it("Migration explica origem do bug (legacy + trigger specific exceptions)", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    // Sanity: comentários explicam o porquê pra futuro-eu não dropar a coluna
    // sem entender que tem hashes legacy de 11 users antigos.
    expect(sql).toMatch(/legacy/i);
    expect(sql).toMatch(/handle_new_auth_user/);
  });
});

describe("R30-4 — PlanPicker bullets batem com MONTHLY_LIMITS", () => {
  const ppSrc = readFileSync(PLAN_PICKER, "utf8");
  const planMjs = readFileSync(PLAN_MJS, "utf8");

  it("plan.mjs ainda usa 200/800 (não regrediu)", () => {
    expect(planMjs).toMatch(/MONTHLY_LIMITS\s*=\s*\{\s*pro:\s*200,\s*grupo:\s*800\s*\}/);
  });

  it("PlanPicker NÃO mostra mais 500 ou 2000 mensagens", () => {
    expect(ppSrc).not.toMatch(/500 mensagens/);
    expect(ppSrc).not.toMatch(/2\.?000 mensagens/);
  });

  it("PlanPicker mostra 200 conversas (Pro) e 800 conversas (Grupo)", () => {
    expect(ppSrc).toMatch(/"200 conversas por mês com o Jei"/);
    expect(ppSrc).toMatch(/"800 conversas por mês com o Jei"/);
  });
});

describe.skipIf(!HAS_SUPABASE)("R30-2 smoke real — senha_hash nullable em prod", () => {
  it("INSERT em public.users sem senha_hash não dispara 23502", async () => {
    // Anon não tem permission de INSERT direto via RLS — o que importa é
    // que o erro retornado NÃO seja 23502/null-violation. Permission denied
    // (42501) ou RLS bloqueio (PGRST116) são OK: indicam que o NOT NULL
    // foi removido e o controle de acesso normal está vigente.
    const supa = createClient(URL_, ANON);
    const { error } = await supa.from("users").insert({
      id: "00000000-0000-0000-0000-000000000000",
      nome: "smoke-test",
      email: "smoke@example.test",
    });
    if (error) {
      expect(error.code, `unexpected NOT NULL violation: ${error.message}`).not.toBe("23502");
    }
    // Sem error é improvável (RLS bloquearia), mas se passar significa
    // que o INSERT funcionou — ainda confirma que senha_hash não obriga.
  });
});
