// Smoke tests R28 — bundle final de dívida técnica.
//
// 5 fixes pequenos cobertos:
// - R28-1: buildMessagesWithCache extraída pra _lib/anthropic-shared.mjs
// - R28-2: useTrips throw em slug collision após 5 tentativas
// - R28-3: signOut await em MyTrips + TripView (e Account intacto)
// - R28-4: roteiroSchemas .strip() em vez de .passthrough()
// - R28-5: useIaConversa version-aware UPSERT + coluna SQL

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const NETLIFY = resolve(__dirname, "../netlify");
const SHARED = join(NETLIFY, "functions/_lib/anthropic-shared.mjs");
const PLAN = join(NETLIFY, "functions/plan.mjs");
const CHAT = join(NETLIFY, "functions/chat.mjs");
const USETRIPS = join(SRC, "hooks/useTrips.js");
const USEIA = join(SRC, "hooks/useIaConversa.js");
const SCHEMAS = join(SRC, "lib/roteiroSchemas.js");
const MYTRIPS = join(SRC, "pages/MyTrips.jsx");
const TRIPVIEW = join(SRC, "pages/TripView.jsx");
const ACCOUNT = join(SRC, "pages/Account.jsx");
const MIGRATION = resolve(__dirname, "../supabase/migrations/2026_05_18_ia_conversas_version_column.sql");

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(URL_ && ANON);

describe("R28-1 — buildMessagesWithCache em _lib/anthropic-shared.mjs", () => {
  it("Arquivo shared existe com export", () => {
    expect(existsSync(SHARED)).toBe(true);
    const src = readFileSync(SHARED, "utf8");
    expect(src).toMatch(/export function buildMessagesWithCache/);
  });

  it("Cache breakpoint na 3a-de-trás-pra-frente preservado", () => {
    const src = readFileSync(SHARED, "utf8");
    expect(src).toMatch(/breakpointIdx\s*=\s*baseHistory\.length\s*-\s*3/);
    expect(src).toMatch(/cache_control:\s*\{\s*type:\s*["']ephemeral["']\s*\}/);
  });

  it("plan.mjs importa do shared e NÃO redefine localmente", () => {
    const src = readFileSync(PLAN, "utf8");
    expect(src).toMatch(/import\s*\{\s*buildMessagesWithCache\s*\}\s*from\s*["']\.\/_lib\/anthropic-shared\.mjs["']/);
    // NÃO tem `function buildMessagesWithCache` local
    expect(src).not.toMatch(/^function buildMessagesWithCache/m);
  });

  it("chat.mjs idem", () => {
    const src = readFileSync(CHAT, "utf8");
    expect(src).toMatch(/import\s*\{\s*buildMessagesWithCache\s*\}\s*from\s*["']\.\/_lib\/anthropic-shared\.mjs["']/);
    expect(src).not.toMatch(/^function buildMessagesWithCache/m);
  });
});

describe("R28-2 — useTrips throw em slug collision", () => {
  const src = readFileSync(USETRIPS, "utf8");

  it("slug inicia null + só atribui em slot livre", () => {
    expect(src).toMatch(/let slug\s*=\s*null/);
    expect(src).toMatch(/if \(!existing\)\s*\{\s*slug\s*=\s*candidate/);
  });

  it("throw com mensagem amigável quando todas as 5 tentativas colidem", () => {
    expect(src).toMatch(/if \(!slug\)\s*\{[\s\S]+?throw new Error\(["']Não foi possível gerar slug único/);
  });

  it("Loop continua sendo 5 tentativas (não 1 nem ∞)", () => {
    expect(src).toMatch(/for \(let i = 0; i < 5; i\+\+\)/);
  });
});

describe("R28-3 — signOut com await em todos os logouts", () => {
  it("MyTrips.jsx: await signOut antes de navigate", () => {
    const src = readFileSync(MYTRIPS, "utf8");
    const block = src.match(/const handleLogout = async[\s\S]+?\};/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/await signOut\(\)/);
    // navigate vem DEPOIS do await
    const awaitIdx = block[0].indexOf("await signOut()");
    const navIdx = block[0].indexOf('navigate("/")');
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(awaitIdx);
  });

  it("TripView.jsx: await signOut no handleLogout", () => {
    const src = readFileSync(TRIPVIEW, "utf8");
    const block = src.match(/const handleLogout = async[\s\S]+?\};/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/await signOut\(\)/);
  });

  it("Account.jsx: await signOut em delete account E em logout (já estavam)", () => {
    const src = readFileSync(ACCOUNT, "utf8");
    // Match 2 ocorrências
    const matches = src.match(/await signOut\(\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("Nenhum signOut() unawaited em código de runtime", () => {
    function walk(dir, exts = /\.(jsx?|mjs)$/) {
      const out = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p, exts));
        else if (exts.test(entry.name)) out.push(p);
      }
      return out;
    }
    const { readdirSync } = require("node:fs");
    const files = walk(SRC);
    const offenders = [];
    for (const f of files) {
      // Skip useAuth (define signOut, não chama)
      if (f.endsWith("useAuth.jsx")) continue;
      const src = readFileSync(f, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match `signOut()` que NÃO seja precedido por `await ` ou `auth.`
        // (auth.signOut é o do supabase, OK estar em useAuth.jsx interno)
        if (/(^|[^.\w])signOut\(\)/.test(line) && !/await\s+signOut/.test(line)) {
          offenders.push(`${f.replace(SRC, "src")}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("R28-4 — roteiroSchemas .strip() em vez de .passthrough()", () => {
  const src = readFileSync(SCHEMAS, "utf8");

  it("Zero ocorrências de .passthrough()", () => {
    expect(src).not.toMatch(/\.passthrough\(\)/);
  });

  it("10 schemas usando .strip() (count específico)", () => {
    const strips = src.match(/\}\)\.strip\(\)/g) ?? [];
    expect(strips.length).toBe(10);
  });

  it("Schemas top-level (RoteiroUpdate, ViagemUpdate) com strip", () => {
    expect(src).toMatch(/export const ViagemUpdate[\s\S]+?\}\)\.strip\(\)/);
    // RoteiroUpdate é uma discriminatedUnion, mas cada ação interna
    // (AddDay/UpdateDay/etc) tem .strip() — checada via count acima.
  });
});

describe("R28-5 — useIaConversa version-aware UPSERT", () => {
  const src = readFileSync(USEIA, "utf8");
  const sql = readFileSync(MIGRATION, "utf8");

  it("SQL migration: ADD COLUMN version int NOT NULL DEFAULT 1", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1/);
  });

  it("Hook lê version no mount SELECT", () => {
    expect(src).toMatch(/\.select\(["']messages, version["']\)/);
  });

  it("versionRef + rowExistsRef pra leitura sync", () => {
    expect(src).toMatch(/versionRef\s*=\s*useRef\(1\)/);
    expect(src).toMatch(/rowExistsRef\s*=\s*useRef\(false\)/);
  });

  it("INSERT inicial quando row não existe", () => {
    // O bloco if (!rowExistsRef.current) tem código aninhado;
    // regex non-greedy fecha no primeiro `}` interno. Verifica que o
    // INSERT com version:1 está PRESENTE no arquivo, e que está depois
    // do check rowExistsRef.
    const idxCheck = src.indexOf("if (!rowExistsRef.current)");
    const idxInsert = src.indexOf(".insert({");
    expect(idxCheck).toBeGreaterThan(-1);
    expect(idxInsert).toBeGreaterThan(idxCheck);
    // INSERT com version: 1 explícito
    expect(src).toMatch(/\.insert\(\{[\s\S]+?version:\s*1/);
  });

  it("Race INSERT: 23505 cai pro path UPDATE (não derruba)", () => {
    expect(src).toMatch(/duplicate key\|unique constraint\|23505/);
  });

  it("UPDATE com WHERE version = currentVersion (optimistic lock)", () => {
    expect(src).toMatch(/\.eq\(["']version["'],\s*currentVersion\)/);
  });

  it("UPDATE bumpa version pra currentVersion + 1", () => {
    expect(src).toMatch(/version:\s*currentVersion\s*\+\s*1/);
  });

  it("Conflito (affected_rows=0): re-fetch + merge + 1 retry", () => {
    expect(src).toMatch(/version conflict/);
    expect(src).toMatch(/function mergeMessages|const mergeMessages/);
  });

  it("mergeMessages dedupe por ts", () => {
    const mergeBlock = src.match(/const mergeMessages = useCallback[\s\S]+?\}, \[\]\);/);
    expect(mergeBlock?.[0]).toBeTruthy();
    expect(mergeBlock[0]).toMatch(/m\?\.ts/);
    expect(mergeBlock[0]).toMatch(/seen\.add/);
  });

  it("Após 2º conflict, exibe erro 'outra aba está editando'", () => {
    expect(src).toMatch(/Outra aba está editando/);
  });

  it("reset zera rowExistsRef + versionRef pra próxima INSERT", () => {
    const block = src.match(/const reset = useCallback[\s\S]+?\}, \[viagemId, userId\]\);/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/rowExistsRef\.current\s*=\s*false/);
    expect(block[0]).toMatch(/versionRef\.current\s*=\s*1/);
  });
});

describe.skipIf(!HAS_SUPABASE)("R28-5 smoke real — coluna version existe em ia_conversas", () => {
  it("SELECT version não dá erro (coluna existe + grant OK pra anon RLS)", async () => {
    const supa = createClient(URL_, ANON);
    // Anon não vê linhas (RLS bloqueia), mas o ERROR seria diferente:
    // - Coluna não existe: ERROR column "version" does not exist
    // - RLS bloqueia: data=[], error=null
    const { error } = await supa.from("ia_conversas").select("version").limit(1);
    expect(error).toBeFalsy();
  });
});
