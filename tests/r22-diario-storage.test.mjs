// Smoke tests R22 — migração fotos do Diário (Base64) → Supabase Storage.
//
// Cobre:
// - Migration SQL: bucket diario com 5MB + RLS por viagem
// - diarioUpload helper: validações + paths + delete folder
// - Diario.jsx: Composer usa upload + crypto.randomUUID + cleanup; render
//   back-compat (URL ou Base64); delete remove Storage
// - Migration script: idempotente, parser data URL, exit codes
// - Smoke real: bucket diario existe em prod

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const HELPER = join(SRC, "lib/diarioUpload.js");
const DIARIO = join(SRC, "components/Diario.jsx");
const MIGRATION = resolve(__dirname, "../supabase/migrations/2026_05_18_diario_storage_bucket.sql");
const SCRIPT = resolve(__dirname, "../scripts/migrate-diario-photos-to-storage.mjs");

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(URL_ && ANON);

describe("R22-1 — Migration SQL bucket diario", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("Bucket 'diario' criado público com 5MB + 3 MIMEs", () => {
    expect(sql).toMatch(/'diario',\s*'diario',\s*true,\s*5242880/);
    expect(sql).toMatch(/image\/jpeg/);
    expect(sql).toMatch(/image\/png/);
    expect(sql).toMatch(/image\/webp/);
  });

  it("ON CONFLICT DO UPDATE → idempotente", () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
  });

  it("4 policies presentes (read/insert/update/delete)", () => {
    expect(sql).toMatch(/CREATE POLICY "diario_public_read"/);
    expect(sql).toMatch(/CREATE POLICY "diario_member_insert"/);
    expect(sql).toMatch(/CREATE POLICY "diario_member_update"/);
    expect(sql).toMatch(/CREATE POLICY "diario_member_delete"/);
  });

  it("INSERT/UPDATE checam is_member_of(viagem_id) — foldername[1]", () => {
    expect(sql).toMatch(/is_member_of\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/);
  });

  it("DELETE: owner==auth.uid() OR is_admin_of (defesa em camadas)", () => {
    const deletePolicy = sql.match(/CREATE POLICY "diario_member_delete"[\s\S]+?\);/);
    expect(deletePolicy?.[0]).toBeTruthy();
    expect(deletePolicy[0]).toMatch(/auth\.uid\(\) = owner/);
    expect(deletePolicy[0]).toMatch(/is_admin_of/);
  });

  it("DROP POLICY IF EXISTS antes de CREATE (idempotente)", () => {
    const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
    expect(drops.length).toBe(4);
  });
});

describe("R22-2 — diarioUpload helper", () => {
  const src = readFileSync(HELPER, "utf8");

  it("Exporta 3 funções principais", () => {
    expect(src).toMatch(/export async function uploadDiarioPhoto/);
    expect(src).toMatch(/export async function uploadDiarioPhotos/);
    expect(src).toMatch(/export async function deleteDiarioPost/);
  });

  it("Limite 5MB (5 * 1024 * 1024)", () => {
    expect(src).toMatch(/MAX_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  });

  it("MIME allowlist jpeg/png/webp", () => {
    expect(src).toMatch(/ALLOWED_MIME[\s\S]+?image\/jpeg[\s\S]+?image\/png[\s\S]+?image\/webp/);
  });

  it("Resize max 1920 preservando aspect ratio (NÃO crop quadrado como avatar)", () => {
    expect(src).toMatch(/OUTPUT_MAX_DIM\s*=\s*1920/);
    // Calcula proporcionalmente em vez de só usar largura/altura fixa
    expect(src).toMatch(/h\s*=\s*Math\.round\(\(h\s*\*\s*OUTPUT_MAX_DIM\)\s*\/\s*w\)/);
  });

  it("Path: {viagemId}/{postId}/{idx}.{ext}", () => {
    expect(src).toMatch(/\$\{viagemId\}\/\$\{postId\}\/\$\{idx\}\.\$\{ext\}/);
  });

  it("uploadDiarioPhotos faz paralelo via Promise.all", () => {
    expect(src).toMatch(/Promise\.all\(/);
    expect(src).toMatch(/files\.map\(\(file,\s*idx\)\s*=>\s*uploadDiarioPhoto/);
  });

  it("deleteDiarioPost lista folder + remove", () => {
    const block = src.match(/export async function deleteDiarioPost[\s\S]+?\n\}/);
    expect(block?.[0]).toMatch(/\.list\(folder/);
    expect(block?.[0]).toMatch(/\.remove\(paths\)/);
  });

  it("deleteDiarioPost erros viram warn (idempotente — post pode não ter fotos)", () => {
    const block = src.match(/export async function deleteDiarioPost[\s\S]+?\n\}/);
    expect(block?.[0]).toMatch(/console\.warn/);
  });

  it("isWebPSupported feature detect", () => {
    expect(src).toMatch(/function isWebPSupported/);
    expect(src).toMatch(/canvas\.toDataURL\("image\/webp"\)/);
  });

  it("Upload com upsert + cacheControl 3600", () => {
    expect(src).toMatch(/upsert:\s*true/);
    expect(src).toMatch(/cacheControl:\s*["']3600["']/);
  });

  it("Erros PT-BR amigáveis em validações", () => {
    expect(src).toMatch(/Formato não suportado/);
    expect(src).toMatch(/Imagem muito grande/);
  });
});

describe("R22-3 — Diario.jsx integração", () => {
  const src = readFileSync(DIARIO, "utf8");

  it("Importa uploadDiarioPhotos e deleteDiarioPost", () => {
    expect(src).toMatch(/import\s*\{[^}]*uploadDiarioPhotos[\s\S]*?deleteDiarioPost[^}]*\}\s*from\s*["']\.\.\/lib\/diarioUpload["']/);
  });

  it("Removeu compressImage local (estava gerando Base64)", () => {
    expect(src).not.toMatch(/function compressImage/);
    expect(src).not.toMatch(/canvas\.toDataURL\("image\/jpeg",\s*JPEG_QUALITY/);
  });

  it("fotoSrc helper top-level pra back-compat URL/Base64/objeto", () => {
    expect(src).toMatch(/function fotoSrc/);
    expect(src).toMatch(/foto\.url\s*\|\|\s*foto\.base64/);
  });

  it("Render da grid usa fotoSrc(foto) em vez de src direto", () => {
    expect(src).toMatch(/const src = fotoSrc\(foto\)/);
  });

  it("Composer gera postId via crypto.randomUUID() ANTES do INSERT", () => {
    expect(src).toMatch(/const postId = crypto\.randomUUID\(\)/);
  });

  it("Composer chama uploadDiarioPhotos com files + viagemId + postId", () => {
    expect(src).toMatch(/uploadDiarioPhotos\(fotos\.map\(\(f\) => f\.file\), trip\.id, postId\)/);
  });

  it("Schema novo: fotos: [{ url }, ...]", () => {
    expect(src).toMatch(/urls\.map\(\(url\) => \(\{\s*url\s*\}\)\)/);
  });

  it("INSERT inclui id: postId (mesmo UUID do path Storage)", () => {
    expect(src).toMatch(/\bid:\s*postId\b/);
  });

  it("Preview via ObjectURL durante composição (sem compressão na pick)", () => {
    expect(src).toMatch(/URL\.createObjectURL\(file\)/);
    expect(src).toMatch(/previewUrl/);
  });

  it("removeFoto faz URL.revokeObjectURL antes de filter", () => {
    const block = src.match(/const removeFoto[\s\S]+?\};/);
    expect(block?.[0]).toMatch(/URL\.revokeObjectURL/);
  });

  it("Cleanup ObjectURLs no unmount via useEffect", () => {
    // Effect com return cleanup que revoga as previewUrls
    expect(src).toMatch(/return \(\) => \{[\s\S]+?revokeObjectURL[\s\S]+?\};/);
  });

  it("deletePost remove row no DB + Storage cleanup fire-and-forget", () => {
    const block = src.match(/const deletePost = async \(p\)[\s\S]+?\};/);
    expect(block?.[0]).toMatch(/\.from\("diario"\)\.delete\(\)/);
    expect(block?.[0]).toMatch(/deleteDiarioPost\(trip\.id,\s*p\.id\)/);
    // fire-and-forget: .catch sem await
    expect(block?.[0]).toMatch(/deleteDiarioPost[\s\S]+?\.catch\(/);
  });

  it("Botão Publicar mostra Enviando/Publicando dependendo do estado", () => {
    expect(src).toMatch(/Enviando…/);
    expect(src).toMatch(/Publicando…/);
  });
});

describe("R22-4 — Migration script", () => {
  const src = readFileSync(SCRIPT, "utf8");

  it("Shebang + .mjs", () => {
    expect(src.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("Exige SUPABASE_SERVICE_KEY, aborta com exit 1 se faltar", () => {
    expect(src).toMatch(/SUPABASE_SERVICE_KEY/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it("Parser data URL aceita jpeg/jpg/png/webp", () => {
    expect(src).toMatch(/jpeg\|jpg\|png\|webp/);
  });

  it("normalizeFotoItem distingue 4 formatos (string url, string data, {url}, {base64})", () => {
    expect(src).toMatch(/function normalizeFotoItem/);
    expect(src).toMatch(/foto\.startsWith\("https:\/\/"\)/);
    expect(src).toMatch(/foto\.startsWith\("data:image\/"\)/);
    expect(src).toMatch(/foto\.url/);
    expect(src).toMatch(/foto\.base64/);
  });

  it("Preserva legenda quando migra", () => {
    expect(src).toMatch(/legenda:\s*item\.legenda/);
  });

  it("Já-migrada (item.url) pula upload (idempotente)", () => {
    // newFotos.push({ url: item.url, ... }); continue;
    expect(src).toMatch(/if \(item\.url\)/);
  });

  it("Upload com upsert + cacheControl 3600", () => {
    expect(src).toMatch(/upsert:\s*true/);
    expect(src).toMatch(/cacheControl:\s*["']3600["']/);
  });

  it("UPDATE diario SET fotos = newFotos após upload", () => {
    expect(src).toMatch(/\.update\(\{\s*fotos:\s*newFotos\s*\}\)/);
  });

  it("Resumo final: posts ok/failed + fotos migradas/falhas", () => {
    expect(src).toMatch(/posts ok=\$\{postsOk\}\s+failed=\$\{postsFailed\}/);
    expect(src).toMatch(/fotos migradas=\$\{totalMigrated\}\s+falhas=\$\{totalFailed\}/);
  });

  it("Exit 3 se falhas; exit 0 se 100% ok", () => {
    expect(src).toMatch(/process\.exit\(3\)/);
    expect(src).toMatch(/process\.exit\(0\)/);
  });
});

// R32-T: createClient DENTRO de cada it() pra não throwar durante
// test collection quando HAS_SUPABASE=false (skipIf só pula execução,
// não a avaliação do body do describe).
describe.skipIf(!HAS_SUPABASE)("R22-1 smoke real — bucket 'diario' em prod", () => {
  it("getPublicUrl pra path do bucket retorna URL válida", () => {
    const supa = createClient(URL_, ANON);
    const { data } = supa.storage.from("diario").getPublicUrl("uuid/uuid/0.webp");
    expect(data?.publicUrl).toMatch(/\/storage\/v1\/object\/public\/diario\/uuid\/uuid\/0\.webp/);
  });

  it("Anon list raiz NÃO dá erro (RLS público leitura)", async () => {
    const supa = createClient(URL_, ANON);
    const { error } = await supa.storage.from("diario").list("", { limit: 1 });
    expect(error).toBeFalsy();
  });
});
