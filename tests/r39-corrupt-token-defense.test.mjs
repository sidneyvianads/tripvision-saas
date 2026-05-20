// Smoke tests R39 — blindagem token corrompido.
//
// Bug real (Sidney 2026-05-20): dezenas de testes manuais acumularam
// JWTs lixo em localStorage["viajjei.auth"] no perfil normal do Chrome.
// supabase-js carregava o token, anexava Authorization Bearer <lixo>
// em toda request e travava (proxy chain timeout em vez de 401 rápido).
//
// O R38 (resilientStorage) cobre JSON malformado, mas NÃO cobre:
//   - JSON válido sem campos do supabase
//   - JWT estruturalmente válido mas exp 2 anos atrás
//   - access_token que não parece JWT (sem 3 partes)
//   - token revogado no servidor (parece OK localmente)
//
// R39 adiciona 2 camadas em cima do R38:
//   1. purgeCorruptedAuthToken() — eager check ANTES do createClient
//   2. runPublicQuery() — retry uma vez se 401 PGRST301/302/42501

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const SUPA = join(SRC, "lib/supabase.js");
const INFLUENCER = join(SRC, "pages/welcome/InfluencerStep.jsx");

describe("R39-1 — purgeCorruptedAuthToken (eager check no boot)", () => {
  const src = readFileSync(SUPA, "utf8");

  it("Função existe e é chamada ANTES do createClient", () => {
    expect(src).toMatch(/function purgeCorruptedAuthToken\(/);
    const purgeIdx = src.indexOf('purgeCorruptedAuthToken("viajjei.auth")');
    const createIdx = src.indexOf("export const supabase = createClient");
    expect(purgeIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(purgeIdx).toBeLessThan(createIdx);
  });

  it("Valida JSON object + campos access_token + refresh_token", () => {
    const body = src.slice(src.indexOf("function purgeCorruptedAuthToken"));
    expect(body).toMatch(/JSON\.parse\(raw\)/);
    expect(body).toMatch(/access_token/);
    expect(body).toMatch(/refresh_token/);
    expect(body).toMatch(/not an object|typeof obj !==\s*["']object["']/);
  });

  it("Verifica que access_token tem 3 partes (JWT shape)", () => {
    const body = src.slice(src.indexOf("function purgeCorruptedAuthToken"));
    expect(body).toMatch(/\.split\(["'].["']\)/);
    expect(body).toMatch(/parts\.length !== 3/);
  });

  it("Decodifica payload + checa exp (janela 7d de refresh)", () => {
    const body = src.slice(src.indexOf("function purgeCorruptedAuthToken"));
    expect(body).toMatch(/atob\(/);
    expect(body).toMatch(/payload\.exp/);
    expect(body).toMatch(/7\s*\*\s*24\s*\*\s*3600|604800|SEVEN_DAYS/);
  });

  it("Lida com base64url (não só base64 padrão)", () => {
    const body = src.slice(src.indexOf("function purgeCorruptedAuthToken"));
    // replace -/+ e _//
    expect(body).toMatch(/\.replace\(\/-\/g,\s*["']\+["']\)/);
    expect(body).toMatch(/\.replace\(\/_\/g,\s*["']\/["']\)/);
  });

  it("removeItem é o que limpa o storage corrompido", () => {
    const body = src.slice(src.indexOf("function purgeCorruptedAuthToken"));
    expect(body).toMatch(/window\.localStorage\.removeItem\(storageKey\)/);
  });

  it("getItem que throw → return silencioso (resilientStorage cuida depois)", () => {
    const body = src.slice(src.indexOf("function purgeCorruptedAuthToken"));
    // catch sem rethrow no getItem inicial
    expect(body).toMatch(/try\s*\{\s*raw = window\.localStorage\.getItem\(storageKey\);\s*\}\s*catch\s*\{\s*return;\s*\}/);
  });

  it("console.warn pra rastrear em prod", () => {
    const body = src.slice(src.indexOf("function purgeCorruptedAuthToken"));
    expect(body).toMatch(/console\.warn\(.*storageKey.*inválido/);
  });
});

describe("R39-2 — runPublicQuery (retry em 401 PGRST301/302/42501)", () => {
  const src = readFileSync(SUPA, "utf8");

  it("Helper exportado", () => {
    expect(src).toMatch(/export async function runPublicQuery\(queryFn\)/);
  });

  it("Reconhece os 3 códigos de auth-error", () => {
    const body = src.slice(src.indexOf("export async function runPublicQuery"));
    expect(body).toMatch(/PGRST301/);
    expect(body).toMatch(/PGRST302/);
    expect(body).toMatch(/42501/);
  });

  it("signOut local ANTES do retry (limpa storage)", () => {
    const body = src.slice(src.indexOf("export async function runPublicQuery"));
    expect(body).toMatch(/supabase\.auth\.signOut\(\{\s*scope:\s*["']local["']/);
  });

  it("Retenta UMA vez (não loop infinito)", () => {
    const body = src.slice(src.indexOf("export async function runPublicQuery"));
    // Conta chamadas a queryFn(): 1 inicial + 1 retry = 2
    const calls = body.match(/queryFn\(\)/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it("Erros não-auth passam direto (sem retry desnecessário)", () => {
    const body = src.slice(src.indexOf("export async function runPublicQuery"));
    expect(body).toMatch(/if \(!looksAuth\) return first/);
  });

  it("console.warn no retry pra rastrear", () => {
    const body = src.slice(src.indexOf("export async function runPublicQuery"));
    expect(body).toMatch(/console\.warn\(.*query pública falhou/);
  });
});

describe("R39-3 — InfluencerStep usa runPublicQuery", () => {
  const src = readFileSync(INFLUENCER, "utf8");

  it("Importa runPublicQuery do supabase lib", () => {
    expect(src).toMatch(/import \{ supabase,\s*runPublicQuery \} from ["']\.\.\/\.\.\/lib\/supabase["']/);
  });

  it("Query envolvida por runPublicQuery", () => {
    expect(src).toMatch(/await runPublicQuery\(\(\) =>\s*supabase\s*\.from\(["']afiliados["']\)/);
  });

  it("Filtros + abortSignal preservados (anti-regressão R37)", () => {
    expect(src).toMatch(/\.eq\(["']ativo["'],\s*true\)/);
    expect(src).toMatch(/\.order\(["']nome["']\)/);
    expect(src).toMatch(/\.abortSignal\(ac\.signal\)/);
  });
});
