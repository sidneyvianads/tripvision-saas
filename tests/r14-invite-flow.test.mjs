// Smoke tests R14 — invite flow.
//
// 5 cenários críticos (string-based contra a migration SQL + sanity
// contra Supabase real se env estiver disponível):
//
//   1. invite_to_trip rejeita não-admin
//   2. invite_to_trip rejeita acima do limite do plano
//   3. accept_invite rejeita token expirado
//   4. accept_invite rejeita email diferente
//   5. accept_invite cria membership corretamente
//
// Por que string-based contra a migration em vez de integration test:
// chamar a RPC autenticada exige sign-in de um user de teste real, que
// exige setup fixture (criar user → criar viagem → invitar → switch user
// → aceitar). Pesado pra smoke. As string-based validam que os guards
// (RAISE EXCEPTION, RETURN motivo) estão presentes no código que rodou
// em prod via MCP apply_migration — se alguém remover por engano numa
// migration futura, o teste vermelha.
//
// O cenário 5 (caminho feliz) tem string check + um teste de "anonymous
// chamada retorna not_authenticated" contra Supabase real quando env
// disponível, garantindo pelo menos que a função existe e responde.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC_SQL = resolve(__dirname, "../supabase/migrations/2026_05_18_invite_rpcs.sql");
const TABLE_SQL = resolve(__dirname, "../supabase/migrations/2026_05_18_viagem_convites_table.sql");
const USETRIPS = resolve(__dirname, "../src/hooks/useTrips.js");
const TRIPVIEW = resolve(__dirname, "../src/pages/TripView.jsx");
const SHAREMODAL = resolve(__dirname, "../src/components/ShareModal.jsx");
const ACCEPT_PAGE = resolve(__dirname, "../src/pages/AcceptInvite.jsx");
const INVITES_LIB = resolve(__dirname, "../src/lib/invites.js");

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(URL && ANON);

describe("R14-S1 — invite_to_trip rejeita não-admin", () => {
  const sql = readFileSync(RPC_SQL, "utf8");
  it("invite_to_trip tem guard explícito is_admin_of", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.invite_to_trip[\s\S]+?\$\$;/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/IF NOT public\.is_admin_of\(p_viagem_id\)/);
    expect(block[0]).toMatch(/RAISE EXCEPTION 'permission denied/);
  });
  it("invite_to_trip exige authenticated", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.invite_to_trip[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/IF auth\.uid\(\) IS NULL/);
    expect(block[0]).toMatch(/'not authenticated'/);
  });
});

describe("R14-S2 — invite_to_trip rejeita acima do limite do plano", () => {
  const sql = readFileSync(RPC_SQL, "utf8");
  it("invite_to_trip chama is_within_plan_limit antes do INSERT", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.invite_to_trip[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/is_within_plan_limit\(p_viagem_id\)/);
    expect(block[0]).toMatch(/'plan_limit_reached'/);
  });
  it("is_within_plan_limit conta members + convites pendentes não expirados", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.is_within_plan_limit[\s\S]+?\$\$;/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/FROM public\.viagem_membros/);
    expect(block[0]).toMatch(/FROM public\.viagem_convites[\s\S]+?aceito_em IS NULL[\s\S]+?expira_em > NOW/);
  });
  it("plan_member_limit reflete os números da landing (Pro=5, Grupo=20)", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.plan_member_limit[\s\S]+?\$\$;/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/'pro'\s+THEN\s+RETURN 5/);
    expect(block[0]).toMatch(/'grupo'\s+THEN\s+RETURN 20/);
  });
});

describe("R14-S3 — accept_invite rejeita token expirado", () => {
  const sql = readFileSync(RPC_SQL, "utf8");
  it("accept_invite checa expira_em < NOW e retorna 'expired'", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.accept_invite[\s\S]+?\$\$;/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/v_conv\.expira_em < NOW\(\)/);
    expect(block[0]).toMatch(/'expired'/);
  });
  it("accept_invite checa já-aceito antes de tudo", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.accept_invite[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/v_conv\.aceito_em IS NOT NULL/);
    expect(block[0]).toMatch(/'already_accepted'/);
  });
});

describe("R14-S4 — accept_invite rejeita email diferente", () => {
  const sql = readFileSync(RPC_SQL, "utf8");
  it("accept_invite compara lower(email) com lower(auth.jwt()->>email)", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.accept_invite[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/lower\(v_conv\.email\)\s*<>\s*v_user_email/);
    expect(block[0]).toMatch(/'email_mismatch'/);
  });
  it("v_user_email vem de auth.jwt() ->> 'email' (não da tabela users)", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.accept_invite[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/);
  });
});

describe("R14-S5 — accept_invite cria membership corretamente", () => {
  const sql = readFileSync(RPC_SQL, "utf8");
  it("INSERT em viagem_membros com ON CONFLICT DO NOTHING (idempotente)", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.accept_invite[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/INSERT INTO public\.viagem_membros/);
    expect(block[0]).toMatch(/ON CONFLICT \(viagem_id, user_id\) DO NOTHING/);
  });
  it("Marca aceito_em + aceito_por depois do INSERT", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.accept_invite[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/UPDATE public\.viagem_convites[\s\S]+?SET aceito_em = NOW\(\)[\s\S]+?aceito_por = auth\.uid\(\)/);
  });
  it("Retorna { ok, viagem_id, slug, role }", () => {
    const block = sql.match(/CREATE OR REPLACE FUNCTION public\.accept_invite[\s\S]+?\$\$;/);
    expect(block[0]).toMatch(/jsonb_build_object\([\s\S]+?'ok',\s*true[\s\S]+?'viagem_id'[\s\S]+?'slug'[\s\S]+?'role'/);
  });
});

describe("R14-7 anti-regressão — useTrips sem auto-INSERT + TripView gate", () => {
  const utSrc = readFileSync(USETRIPS, "utf8");
  const tvSrc = readFileSync(TRIPVIEW, "utf8");
  it("useTrip NÃO faz mais INSERT em viagem_membros (auto-join removido)", () => {
    const useTripBlock = utSrc.match(/export function useTrip[\s\S]+$/);
    expect(useTripBlock?.[0]).toBeTruthy();
    expect(useTripBlock[0]).not.toMatch(/\.from\(["']viagem_membros["']\)\s*[\s\S]{0,100}\.insert\(/);
  });
  it("useTrip retorna role=null pra não-membro (em vez de auto-criar)", () => {
    const useTripBlock = utSrc.match(/export function useTrip[\s\S]+$/);
    expect(useTripBlock[0]).toMatch(/setRole\(m\?\.role\s*\?\?\s*null\)/);
  });
  it("TripView renderiza NonMemberGate quando !role", () => {
    expect(tvSrc).toMatch(/if\s*\(!role\)\s*\{?\s*return\s*<NonMemberGate/);
    expect(tvSrc).toMatch(/function NonMemberGate/);
  });
});

describe("R14-1 — tabela viagem_convites tem schema + RLS esperados", () => {
  const sql = readFileSync(TABLE_SQL, "utf8");
  it("token UUID UNIQUE DEFAULT gen_random_uuid()", () => {
    expect(sql).toMatch(/token UUID NOT NULL DEFAULT gen_random_uuid\(\) UNIQUE/);
  });
  it("expira_em default NOW + 7 dias", () => {
    expect(sql).toMatch(/expira_em TIMESTAMPTZ[\s\S]+?DEFAULT \(NOW\(\) \+ INTERVAL '7 days'\)/);
  });
  it("UNIQUE parcial em (viagem_id, lower(email)) WHERE aceito_em IS NULL", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]+?viagem_convites_pending_unique[\s\S]+?\(viagem_id, lower\(email\)\)[\s\S]+?WHERE aceito_em IS NULL/);
  });
  it("RLS habilitado + policy SELECT (sem policy INSERT/UPDATE/DELETE)", () => {
    expect(sql).toMatch(/ALTER TABLE public\.viagem_convites ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY viagem_convites_select[\s\S]+?FOR SELECT/);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]+?FOR (INSERT|UPDATE|DELETE)/);
  });
});

describe("Frontend invite UX — ShareModal tabs + AcceptInvite + lib", () => {
  const sm = readFileSync(SHAREMODAL, "utf8");
  const ap = readFileSync(ACCEPT_PAGE, "utf8");
  const lib = readFileSync(INVITES_LIB, "utf8");
  it("ShareModal tem 2 tabs (link + email)", () => {
    expect(sm).toMatch(/initialTab/);
    expect(sm).toMatch(/setTab\(["']email["']\)/);
    expect(sm).toMatch(/function EmailPanel/);
    expect(sm).toMatch(/function LinkPanel/);
  });
  it("AcceptInvite redireciona pra /welcome?invite=token quando não-logado", () => {
    expect(ap).toMatch(/\/welcome\?invite=/);
  });
  it("AcceptInvite chama supabase.rpc('accept_invite', { p_token })", () => {
    expect(ap).toMatch(/rpc\(["']accept_invite["'],\s*\{\s*p_token:/);
  });
  it("lib/invites usa RPC invite_to_trip + dispara /api/send-invite-email", () => {
    expect(lib).toMatch(/rpc\(["']invite_to_trip["']/);
    expect(lib).toMatch(/\/api\/send-invite-email/);
  });
});

// R32-T: createClient DENTRO de cada it() pra não throwar durante
// test collection quando HAS_SUPABASE=false (skipIf só pula execução,
// não a avaliação do body do describe).
describe.skipIf(!HAS_SUPABASE)("RPCs respondem (smoke real anônimo)", () => {
  // Sem JWT, RPC deve retornar erro 'not authenticated' (ou similar).
  // Confirma que a função EXISTE e está GRANTed pra authenticated.
  it("invite_to_trip anônimo → 'not authenticated'", async () => {
    const supa = createClient(URL, ANON);
    const { error } = await supa.rpc("invite_to_trip", {
      p_viagem_id: "00000000-0000-0000-0000-000000000000",
      p_email: "x@y.com",
      p_role: "membro",
    });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/not authenticated|authentication|jwt|denied/i);
  });
  it("accept_invite anônimo → 'not authenticated'", async () => {
    const supa = createClient(URL, ANON);
    const { error } = await supa.rpc("accept_invite", {
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/not authenticated|authentication|jwt|denied/i);
  });
  it("revoke_invite anônimo → 'not authenticated'", async () => {
    const supa = createClient(URL, ANON);
    const { error } = await supa.rpc("revoke_invite", {
      p_convite_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/not authenticated|authentication|jwt|denied/i);
  });
});
