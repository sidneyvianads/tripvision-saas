// Smoke tests R23 — TTL/truncate de ia_conversas.
//
// Cobre:
// - R23-1 SQL: log table + trigger + count migrado
// - R23-2 SQL: truncate RPC + admin stats RPC
// - R23-3 cron function: schedule + auth + idempotência
// - Smoke real: ia_conversa_log existe e accessível, count_in_month
//   continua funcional via log

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(__dirname, "../supabase/migrations");
const LOG_SQL = join(MIGRATIONS, "2026_05_18_ia_conversa_log_table.sql");
const RPC_SQL = join(MIGRATIONS, "2026_05_18_truncate_ia_messages_rpcs.sql");
const CRON_FN = resolve(__dirname, "../netlify/functions/cron-truncate-ia-conversas.mjs");
const NETLIFY_TOML = resolve(__dirname, "../netlify.toml");

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(URL_ && ANON);

describe("R23-1 — ia_conversa_log + trigger + count migrado", () => {
  const sql = readFileSync(LOG_SQL, "utf8");

  it("Cria tabela ia_conversa_log com PK (conversa_id, ts_ms)", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ia_conversa_log/);
    expect(sql).toMatch(/PRIMARY KEY \(conversa_id, ts_ms\)/);
  });

  it("Coluna ts GENERATED FROM ts_ms (timestamp pra index direto)", () => {
    expect(sql).toMatch(/ts timestamptz GENERATED ALWAYS AS \(to_timestamp\(ts_ms \/ 1000\.0\)\) STORED/);
  });

  it("FK ON DELETE CASCADE pra ia_conversas (garbage collection)", () => {
    expect(sql).toMatch(/REFERENCES public\.ia_conversas\(id\) ON DELETE CASCADE/);
  });

  it("Indexes (user_id, ts) full + partial WHERE NOT is_welcome", () => {
    expect(sql).toMatch(/ia_conversa_log_user_ts_idx/);
    expect(sql).toMatch(/ia_conversa_log_user_role_ts_idx[\s\S]+?WHERE NOT is_welcome/);
  });

  it("RLS habilitado + SELECT policy user_id = auth.uid()", () => {
    expect(sql).toMatch(/ALTER TABLE public\.ia_conversa_log ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FOR SELECT TO authenticated[\s\S]+?user_id = auth\.uid\(\)/);
  });

  it("Trigger AFTER INSERT OR UPDATE OF messages com ON CONFLICT", () => {
    expect(sql).toMatch(/CREATE TRIGGER ia_conversas_sync_log[\s\S]+?AFTER INSERT OR UPDATE OF messages/);
    expect(sql).toMatch(/ON CONFLICT \(conversa_id, ts_ms\) DO NOTHING/);
  });

  it("Trigger filtra ts inválidos via regex", () => {
    expect(sql).toMatch(/WHERE m->>'ts' ~ '\^\[0-9\]\+\$'/);
  });

  it("Backfill idempotente no fim da migration", () => {
    const backfill = sql.match(/INSERT INTO public\.ia_conversa_log[\s\S]+?ON CONFLICT[^;]+?;/g) ?? [];
    // 1 dentro do trigger + 1 backfill = 2 ocorrências
    expect(backfill.length).toBeGreaterThanOrEqual(2);
  });

  it("count_ia_user_messages_in_month migrado pra ler da log table", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.count_ia_user_messages_in_month[\s\S]+?\$\$;/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn[0]).toMatch(/FROM public\.ia_conversa_log/);
    expect(fn[0]).not.toMatch(/jsonb_array_elements\(c\.messages\)/);
  });

  it("count filtra role='user' AND NOT is_welcome AND ts >= date_trunc('month', now())", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.count_ia_user_messages_in_month[\s\S]+?\$\$;/);
    expect(fn[0]).toMatch(/role = 'user'/);
    expect(fn[0]).toMatch(/NOT is_welcome/);
    expect(fn[0]).toMatch(/ts >= date_trunc\('month', now\(\)\)/);
  });

  it("count_today similar, ts >= date_trunc('day', now())", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.count_ia_user_messages_today[\s\S]+?\$\$;/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn[0]).toMatch(/ts >= date_trunc\('day', now\(\)\)/);
  });

  it("Guards de auth.uid() preservados nas count_*", () => {
    expect(sql).toMatch(/IF auth\.uid\(\) IS NULL THEN[\s\S]+?'not authenticated'/);
    expect(sql).toMatch(/uid <> auth\.uid\(\) AND NOT is_platform_owner\(\)/);
  });
});

describe("R23-2 — truncate_old_ia_messages + admin_ia_conversas_stats", () => {
  const sql = readFileSync(RPC_SQL, "utf8");

  it("truncate retorna jsonb com stats esperados", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.truncate_old_ia_messages[\s\S]+?\$\$;/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn[0]).toMatch(/RETURNS jsonb/);
    expect(fn[0]).toMatch(/'rows_processed'/);
    expect(fn[0]).toMatch(/'messages_removed'/);
    expect(fn[0]).toMatch(/'bytes_saved'/);
    expect(fn[0]).toMatch(/'keep_last'/);
  });

  it("truncate aceita auth.uid()=NULL (cron service_role) OU owner logado", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.truncate_old_ia_messages[\s\S]+?\$\$;/);
    // Guard: bloqueia user normal logado mas permite NULL (service_role) e owner.
    expect(fn[0]).toMatch(/IF auth\.uid\(\) IS NOT NULL AND NOT is_platform_owner\(\)/);
  });

  it("truncate clampa p_keep_last >= 1 (anti-zero/negativo)", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.truncate_old_ia_messages[\s\S]+?\$\$;/);
    expect(fn[0]).toMatch(/GREATEST\(1, p_keep_last\)/);
  });

  it("truncate usa WITH ORDINALITY pra preservar ordem das últimas N", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.truncate_old_ia_messages[\s\S]+?\$\$;/);
    expect(fn[0]).toMatch(/jsonb_array_elements\(cand\.messages\) WITH ORDINALITY/);
    expect(fn[0]).toMatch(/ORDER BY ord DESC[\s\S]+?LIMIT v_keep/);
    // jsonb_agg final ORDER BY ord ASC pra reconstruir o array na ordem cronológica
    expect(fn[0]).toMatch(/jsonb_agg\(elem ORDER BY ord\)/);
  });

  it("truncate seta updated_at = now() (cache-bust no client)", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.truncate_old_ia_messages[\s\S]+?\$\$;/);
    expect(fn[0]).toMatch(/updated_at = now\(\)/);
  });

  it("admin_ia_conversas_stats strict guard is_platform_owner", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_ia_conversas_stats[\s\S]+?\$\$;/);
    expect(fn?.[0]).toBeTruthy();
    // Sem NULL exception: só owner logado
    expect(fn[0]).toMatch(/IF NOT is_platform_owner\(\) THEN[\s\S]+?'permission denied'/);
  });

  it("admin_stats retorna shape esperado (8 chaves)", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_ia_conversas_stats[\s\S]+?\$\$;/);
    const keys = ["total_rows", "total_messages_in_array", "total_messages_in_log",
      "avg_messages_per_row", "max_messages_per_row", "total_bytes",
      "rows_over_50", "rows_over_100"];
    for (const k of keys) expect(fn[0]).toMatch(new RegExp(`'${k}'`));
  });

  it("REVOKE ALL + GRANT EXECUTE TO authenticated nas 2", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.truncate_old_ia_messages\(int\) FROM public/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_ia_conversas_stats\(\) FROM public/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.truncate_old_ia_messages\(int\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_ia_conversas_stats\(\) TO authenticated/);
  });
});

describe("R23-3 — cron-truncate-ia-conversas function", () => {
  const src = readFileSync(CRON_FN, "utf8");
  const toml = readFileSync(NETLIFY_TOML, "utf8");

  it("Schedule '0 4 1 * *' (dia 1º 04h UTC = 01h BRT)", () => {
    expect(src).toMatch(/schedule:\s*["']0 4 1 \* \*["']/);
  });

  it("KEEP_LAST = 50 (5× margem vs Jei usar 10)", () => {
    expect(src).toMatch(/KEEP_LAST\s*=\s*50/);
  });

  it("Usa SUPABASE_SERVICE_KEY (não anon)", () => {
    expect(src).toMatch(/SUPABASE_SERVICE_KEY/);
    expect(src).not.toMatch(/SUPABASE_ANON_KEY/);
  });

  it("Aborta se env vars ausentes", () => {
    expect(src).toMatch(/if \(!SUPABASE_URL \|\| !SUPABASE_KEY\)/);
    expect(src).toMatch(/missing env/);
  });

  it("Chama RPC truncate_old_ia_messages via PostgREST", () => {
    expect(src).toMatch(/\/rest\/v1\/rpc\/truncate_old_ia_messages/);
    expect(src).toMatch(/p_keep_last:\s*KEEP_LAST/);
  });

  it("Erro HTTP captura via captureException", () => {
    expect(src).toMatch(/captureException/);
    expect(src).toMatch(/source:\s*["']cron-truncate-ia["']/);
  });

  it("Loga elapsed_ms no resultado pra observability", () => {
    expect(src).toMatch(/elapsed_ms/);
    expect(src).toMatch(/Date\.now\(\) - startMs/);
  });

  it("netlify.toml registra timeout 26s pra function", () => {
    expect(toml).toMatch(/\[functions\."cron-truncate-ia-conversas"\][\s\S]+?timeout = 26/);
  });
});

// R32-T: createClient DENTRO de cada it() pra não throwar durante
// test collection quando HAS_SUPABASE=false (skipIf só pula execução,
// não a avaliação do body do describe).
describe.skipIf(!HAS_SUPABASE)("R23-1 smoke real — log table accessível", () => {
  it("Anônimo NÃO acessa ia_conversa_log (RLS bloqueia)", async () => {
    const supa = createClient(URL_, ANON);
    const { data, error } = await supa.from("ia_conversa_log").select("user_id").limit(1);
    // RLS deve filtrar zero rows pra anônimo (user_id = auth.uid() = null)
    expect(error).toBeFalsy();
    expect(data ?? []).toEqual([]);
  });

  it("Anônimo NÃO chama count_ia_user_messages_in_month (auth required)", async () => {
    const supa = createClient(URL_, ANON);
    const { error } = await supa.rpc("count_ia_user_messages_in_month", {
      uid: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeTruthy();
    // PostgREST com REVOKE da role anon dá "permission denied for function".
    // Authenticated user logado mas não-owner tentando uid alheio bate
    // o RAISE EXCEPTION interno. Ambos batem na regex.
    expect(error.message).toMatch(/permission denied|not authenticated|jwt|auth/i);
  });

  it("Anônimo NÃO chama admin_ia_conversas_stats", async () => {
    const supa = createClient(URL_, ANON);
    const { error } = await supa.rpc("admin_ia_conversas_stats");
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/permission denied|jwt|auth/i);
  });
});
