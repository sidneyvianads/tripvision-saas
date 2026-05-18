// Smoke tests R19 — paginação + busca + filtros no AdminAfiliados.
//
// Cobre:
// - Pagination.jsx: variants, a11y, props esperados
// - useDebounce: shape esperado
// - csvExport helper: BOM, escape de aspas, blob+download
// - Migration SQL: 3 RPCs existem com signature/sort-validation esperada
// - AdminAfiliados.jsx: usa os 3 RPCs paginados com aborter
// - Smoke real (skipIf sem Supabase): RPCs respondem com permission denied
//   pra non-platform-owner (proteção mantida)

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const PAG = join(SRC, "components/Pagination.jsx");
const DEBOUNCE = join(SRC, "lib/useDebounce.js");
const CSV = join(SRC, "lib/csvExport.js");
const ADMIN = join(SRC, "pages/AdminAfiliados.jsx");
const MIGRATION = resolve(__dirname, "../supabase/migrations/2026_05_18_admin_paginated_rpcs.sql");

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(URL && ANON);

describe("R19-1 — Pagination component", () => {
  const src = readFileSync(PAG, "utf8");

  it("exporta componente com props esperados", () => {
    expect(src).toMatch(/export default function Pagination/);
    expect(src).toMatch(/currentPage/);
    expect(src).toMatch(/totalCount/);
    expect(src).toMatch(/pageSize/);
    expect(src).toMatch(/onPageChange/);
    expect(src).toMatch(/onPageSizeChange/);
    expect(src).toMatch(/variant/);
  });

  it("a11y: role=navigation + aria-label", () => {
    expect(src).toMatch(/role="navigation"/);
    expect(src).toMatch(/aria-label=\{`Paginação de \$\{label\}`\}/);
  });

  it("botões com aria-label descritivo", () => {
    expect(src).toMatch(/aria-label="Primeira página"/);
    expect(src).toMatch(/aria-label="Página anterior"/);
    expect(src).toMatch(/aria-label="Próxima página"/);
    expect(src).toMatch(/aria-label="Última página"/);
  });

  it("jump-to-page com input controlled-buffer (commit em Enter/blur)", () => {
    expect(src).toMatch(/function JumpToPage/);
    expect(src).toMatch(/onBlur=\{commit\}/);
    expect(src).toMatch(/e\.key === "Enter"/);
  });

  it("variants 'full' e 'simple' diferenciam UI", () => {
    expect(src).toMatch(/variant === "full"/);
    // Botões primeira/última só aparecem em full
    expect(src).toMatch(/\{variant === "full" && \(/);
  });

  it("clampa página entre 1 e totalPages", () => {
    expect(src).toMatch(/Math\.max\(1, Math\.min\(p, totalPages\)\)/);
  });

  it("contador 'X–Y de Z' com aria-live (mostra ao screen reader)", () => {
    expect(src).toMatch(/aria-live="polite"/);
  });
});

describe("R19-1 — useDebounce hook", () => {
  const src = readFileSync(DEBOUNCE, "utf8");

  it("exporta useDebounce, retorna debounced value", () => {
    expect(src).toMatch(/export function useDebounce/);
    expect(src).toMatch(/useState\(value\)/);
  });

  it("setTimeout com cleanup", () => {
    expect(src).toMatch(/setTimeout\(\(\) => setDebounced\(value\), delay\)/);
    expect(src).toMatch(/clearTimeout\(t\)/);
  });

  it("dep array inclui value E delay", () => {
    expect(src).toMatch(/\}, \[value, delay\]\)/);
  });
});

describe("R19-6 — csvExport helper", () => {
  const src = readFileSync(CSV, "utf8");

  it("exporta downloadCsv", () => {
    expect(src).toMatch(/export function downloadCsv/);
  });

  it("escape RFC 4180 (aspas duplas viram \"\")", () => {
    expect(src).toMatch(/replace\(\/"\/g, '""'\)/);
  });

  it("BOM ﻿ no início pra Excel BR abrir com acentos", () => {
    // O literal BOM (U+FEFF) tem que estar antes do CSV.
    expect(src).toMatch(/"﻿"|﻿\s*\+/);
  });

  it("Blob com mime text/csv;charset=utf-8", () => {
    expect(src).toMatch(/type:\s*["']text\/csv;charset=utf-8/);
  });

  it("anchor temporário pra Firefox compat (appendChild+click+remove)", () => {
    expect(src).toMatch(/document\.body\.appendChild\(a\)/);
    expect(src).toMatch(/a\.click\(\)/);
    expect(src).toMatch(/document\.body\.removeChild\(a\)/);
  });

  it("URL.revokeObjectURL no fim", () => {
    expect(src).toMatch(/URL\.revokeObjectURL\(url\)/);
  });
});

describe("R19-2 — Migration SQL com 3 RPCs paginadas", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("admin_afiliados_list_v2 com defaults page/page_size", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_afiliados_list_v2[\s\S]+?\$\$;/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/p_page int DEFAULT 1/);
    expect(block[0]).toMatch(/p_page_size int DEFAULT 25/);
    expect(block[0]).toMatch(/p_search text DEFAULT NULL/);
    expect(block[0]).toMatch(/p_filter_ativo text DEFAULT 'todos'/);
  });

  it("admin_users_list aceita p_filter_plano + p_filter_afiliado", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_users_list[\s\S]+?\$\$;/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/p_filter_plano text DEFAULT 'todos'/);
    expect(block[0]).toMatch(/p_filter_afiliado uuid DEFAULT NULL/);
  });

  it("admin_comissoes_list aceita p_filter_status + p_filter_mes", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_comissoes_list[\s\S]+?\$\$;/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/p_filter_status text DEFAULT 'todos'/);
    expect(block[0]).toMatch(/p_filter_mes text DEFAULT NULL/);
  });

  it("todas as 3 RPCs guardam is_platform_owner antes de SQL dinâmico", () => {
    // Anti-RCE: SECURITY DEFINER + sort_col/sort_dir validados via CASE WHEN
    // (não interpolados direto). Guard impede non-owner acessar.
    const fns = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_(afiliados_list_v2|users_list|comissoes_list)[\s\S]+?\$\$;/g);
    expect(fns?.length).toBe(3);
    for (const fn of fns) {
      expect(fn).toMatch(/IF NOT is_platform_owner\(\) THEN/);
      expect(fn).toMatch(/RAISE EXCEPTION 'permission denied'/);
    }
  });

  it("RPCs retornam JSONB com {rows, total, page, page_size}", () => {
    const fns = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_(afiliados_list_v2|users_list|comissoes_list)[\s\S]+?\$\$;/g);
    expect(fns?.length).toBe(3);
    for (const fn of fns) {
      expect(fn).toMatch(/RETURNS jsonb/);
      expect(fn).toMatch(/jsonb_build_object\([\s\S]*?'rows'[\s\S]+?'total'/);
    }
  });

  it("Indexes pra colunas de filtro/ordenação foram adicionados", () => {
    expect(sql).toMatch(/afiliados_created_at_idx/);
    expect(sql).toMatch(/users_created_at_idx/);
    expect(sql).toMatch(/users_plano_idx/);
    expect(sql).toMatch(/comissoes_status_idx/);
    expect(sql).toMatch(/comissoes_created_at_idx/);
  });

  it("sort_col validado via CASE WHEN (anti-SQL-injection)", () => {
    // Sort dinâmico em ORDER BY %I — mas só aceita valores do CASE.
    expect(sql).toMatch(/CASE p_sort_col[\s\S]+?ELSE 'created_at'/);
    expect(sql).toMatch(/CASE lower\(COALESCE\(p_sort_dir, 'desc'\)\)/);
  });

  it("REVOKE ALL FROM public + GRANT EXECUTE TO authenticated nas 3", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_afiliados_list_v2[\s\S]+?FROM public/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_users_list[\s\S]+?FROM public/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_comissoes_list[\s\S]+?FROM public/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_afiliados_list_v2[\s\S]+?TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_users_list[\s\S]+?TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_comissoes_list[\s\S]+?TO authenticated/);
  });
});

describe("R19-3/4/5 — AdminAfiliados usa RPCs paginadas + AbortController", () => {
  const src = readFileSync(ADMIN, "utf8");

  it("AfiliadosTab usa admin_afiliados_list_v2 (não a antiga sem params)", () => {
    const block = src.match(/function AfiliadosTab[\s\S]+?^\}/m);
    expect(block?.[0]).toMatch(/rpc\("admin_afiliados_list_v2"/);
  });

  it("UsuariosTab usa admin_users_list (não .from('users').limit(500))", () => {
    const block = src.match(/function UsuariosTab[\s\S]+?^\}/m);
    expect(block?.[0]).toMatch(/rpc\("admin_users_list"/);
    // O anti-padrão era .from("users")...limit(500). Comentário menciona
    // ".limit(500)" como referência histórica — anchora no .from pra
    // distinguir uso real de menção textual.
    expect(block?.[0]).not.toMatch(/\.from\(["']users["']\)[\s\S]+?\.limit\(500\)/);
  });

  it("ComissoesTab usa admin_comissoes_list", () => {
    const block = src.match(/function ComissoesTab[\s\S]+?^\}/m);
    expect(block?.[0]).toMatch(/rpc\("admin_comissoes_list"/);
  });

  it("Todos os 3 tabs montam AbortController no useEffect de reload", () => {
    // Apparições: 3 (uma por tab) + cleanup return ctrl.abort()
    const aborts = src.match(/const ctrl = new AbortController\(\)/g) ?? [];
    expect(aborts.length).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(/return \(\) => ctrl\.abort\(\)/);
  });

  it("Todos os 3 tabs usam Pagination component", () => {
    const paginations = src.match(/<Pagination/g) ?? [];
    expect(paginations.length).toBe(3);
  });

  it("Todos os 3 tabs resetam page pra 1 quando filtros mudam", () => {
    const resets = src.match(/setPage\(1\)/g) ?? [];
    // 1 effect por tab (3) + opcionalmente em handlers — pelo menos 3
    expect(resets.length).toBeGreaterThanOrEqual(3);
  });

  it("CSV export passa page_size=10000 pra puxar todos os filtrados", () => {
    const csvCalls = src.match(/p_page_size:\s*10000/g) ?? [];
    // 3 RPCs ×1 chamada cada no exportCsv
    expect(csvCalls.length).toBe(3);
  });

  it("useDebounce(search, 300) aplicado no AfiliadosTab + UsuariosTab", () => {
    const debounces = src.match(/useDebounce\(search,\s*300\)/g) ?? [];
    expect(debounces.length).toBeGreaterThanOrEqual(2);
  });
});

describe.skipIf(!HAS_SUPABASE)("R19-2 — RPCs respondem (smoke real anônimo)", () => {
  const supa = createClient(URL, ANON);

  it("admin_afiliados_list_v2 anônimo → permission denied", async () => {
    const { error } = await supa.rpc("admin_afiliados_list_v2", { p_page: 1, p_page_size: 1 });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/permission denied|not authenticated|jwt/i);
  });

  it("admin_users_list anônimo → permission denied", async () => {
    const { error } = await supa.rpc("admin_users_list", { p_page: 1, p_page_size: 1 });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/permission denied|not authenticated|jwt/i);
  });

  it("admin_comissoes_list anônimo → permission denied", async () => {
    const { error } = await supa.rpc("admin_comissoes_list", { p_page: 1, p_page_size: 1 });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/permission denied|not authenticated|jwt/i);
  });
});
