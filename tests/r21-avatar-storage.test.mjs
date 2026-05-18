// Smoke tests R21 — migração de avatar Base64 inline → Supabase Storage.
//
// Cobre:
// - Migration SQL: bucket avatars existe com size/MIME limits + 4 RLS policies
// - avatarUpload helper: shape + validações (2MB, MIME) + path convention
// - Avatar.jsx: aceita URL e Base64, fallback gracioso onError
// - PhotoPicker: 2 modos (Base64 default, Storage com uploadFor opt-in)
// - Migration script: estrutura idempotente, exige service_role, parser data URL
// - Smoke real (skipIf sem Supabase): bucket avatars EXISTE em prod

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const HELPER = join(SRC, "lib/avatarUpload.js");
const AVATAR = join(SRC, "components/Avatar.jsx");
const PICKER = join(SRC, "components/PhotoPicker.jsx");
const PROFILE = join(SRC, "components/Profile.jsx");
const MIGRATION = resolve(__dirname, "../supabase/migrations/2026_05_18_avatars_storage_bucket.sql");
const SCRIPT = resolve(__dirname, "../scripts/migrate-avatars-to-storage.mjs");

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const HAS_SUPABASE = Boolean(URL_ && ANON);

describe("R21-1 — Migration SQL bucket + RLS", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("INSERT em storage.buckets com avatars + size 2MB + MIMEs", () => {
    expect(sql).toMatch(/INSERT INTO storage\.buckets[\s\S]+?'avatars'/);
    expect(sql).toMatch(/2097152/);  // 2MB em bytes
    expect(sql).toMatch(/image\/jpeg/);
    expect(sql).toMatch(/image\/png/);
    expect(sql).toMatch(/image\/webp/);
  });

  it("Bucket é public (true)", () => {
    // Linha "VALUES ('avatars', 'avatars', true," confirma público
    expect(sql).toMatch(/'avatars',\s*'avatars',\s*true/);
  });

  it("ON CONFLICT DO UPDATE → idempotente", () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
  });

  it("4 policies: SELECT (público), INSERT/UPDATE/DELETE (owner)", () => {
    expect(sql).toMatch(/CREATE POLICY "avatars_public_read"[\s\S]+?FOR SELECT TO public/);
    expect(sql).toMatch(/CREATE POLICY "avatars_owner_insert"[\s\S]+?FOR INSERT TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY "avatars_owner_update"[\s\S]+?FOR UPDATE TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY "avatars_owner_delete"[\s\S]+?FOR DELETE TO authenticated/);
  });

  it("Owner check usa auth.uid()::text == foldername[1]", () => {
    expect(sql).toMatch(/auth\.uid\(\)::text\s*=\s*\(storage\.foldername\(name\)\)\[1\]/);
  });

  it("DROP POLICY IF EXISTS antes de CREATE (idempotente)", () => {
    const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
    expect(drops.length).toBe(4);
  });
});

describe("R21-2 — avatarUpload helper", () => {
  const src = readFileSync(HELPER, "utf8");

  it("Exporta uploadAvatar + deleteAvatar", () => {
    expect(src).toMatch(/export async function uploadAvatar/);
    expect(src).toMatch(/export async function deleteAvatar/);
  });

  it("Limite 2MB (2 * 1024 * 1024)", () => {
    expect(src).toMatch(/MAX_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
  });

  it("MIME allowlist: jpeg/png/webp", () => {
    expect(src).toMatch(/ALLOWED_MIME[\s\S]+?image\/jpeg[\s\S]+?image\/png[\s\S]+?image\/webp/);
  });

  it("Output size 256 (cobre Avatar 96px retina 2×)", () => {
    expect(src).toMatch(/OUTPUT_SIZE\s*=\s*256/);
  });

  it("Path convention: {userId}/avatar.{ext}", () => {
    expect(src).toMatch(/\$\{userId\}\/avatar\.\$\{ext\}/);
  });

  it("isWebPSupported via canvas.toDataURL('image/webp')", () => {
    expect(src).toMatch(/function isWebPSupported/);
    expect(src).toMatch(/canvas\.toDataURL\("image\/webp"\)/);
    expect(src).toMatch(/startsWith\("data:image\/webp"\)/);
  });

  it("Upload com upsert true + cacheControl 3600", () => {
    expect(src).toMatch(/upsert:\s*true/);
    expect(src).toMatch(/cacheControl:\s*["']3600["']/);
  });

  it("URL inclui ?v=timestamp pra cache-bust ao trocar foto", () => {
    expect(src).toMatch(/\?v=\$\{Date\.now\(\)\}/);
  });

  it("deleteAvatar tenta 3 paths possíveis (webp/jpg/png) idempotente", () => {
    expect(src).toMatch(/avatar\.webp/);
    expect(src).toMatch(/avatar\.jpg/);
    expect(src).toMatch(/avatar\.png/);
  });

  it("deleteAvatar ignora 'not found' do Storage (idempotente)", () => {
    expect(src).toMatch(/not found/i);
  });

  it("deleteAvatar zera users.avatar_url no DB", () => {
    expect(src).toMatch(/\.update\(\{\s*avatar_url:\s*null\s*\}\)/);
  });

  it("Validações lançam Error com mensagem PT-BR amigável", () => {
    expect(src).toMatch(/Formato não suportado/);
    expect(src).toMatch(/Imagem muito grande/);
    expect(src).toMatch(/Não logado/);
  });
});

describe("R21-2 — Avatar.jsx back-compat URL/Base64 + onError fallback", () => {
  const src = readFileSync(AVATAR, "utf8");

  it("Usa state failed pra detectar URL quebrada", () => {
    expect(src).toMatch(/const \[failed, setFailed\]/);
  });

  it("img.onError seta failed=true → cai pro fallback colorido", () => {
    expect(src).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
  });

  it("Renderiza img quando avatar_url existe E !failed", () => {
    expect(src).toMatch(/user\?\.avatar_url\s*&&\s*!failed/);
  });

  it("Fallback colorido com inicial sempre tem algo pra mostrar", () => {
    expect(src).toMatch(/background:\s*cor/);
    expect(src).toMatch(/aria-hidden/);
  });
});

describe("R21-3 — PhotoPicker dual-mode (Base64 / Storage)", () => {
  const src = readFileSync(PICKER, "utf8");

  it("Importa uploadAvatar do helper", () => {
    expect(src).toMatch(/import\s*\{\s*uploadAvatar\s*\}\s*from\s*["']\.\.\/lib\/avatarUpload["']/);
  });

  it("Aceita prop uploadFor (modo Storage)", () => {
    expect(src).toMatch(/uploadFor\s*=\s*null/);
  });

  it("Se uploadFor → chama uploadAvatar; senão Base64 legacy", () => {
    expect(src).toMatch(/if \(uploadFor\)/);
    expect(src).toMatch(/await uploadAvatar\(uploadFor, file\)/);
    expect(src).toMatch(/await fileToResizedDataUrl\(file/);
  });

  it("Spinner text 'enviando…' durante busy", () => {
    expect(src).toMatch(/enviando…/);
  });

  it("Rejeição HEIC mantida (Canvas API não decodifica)", () => {
    expect(src).toMatch(/heic\|heif/i);
    expect(src).toMatch(/HEIC não suportado/);
  });

  it("Profile.jsx passa uploadFor={user?.id}", () => {
    const profile = readFileSync(PROFILE, "utf8");
    expect(profile).toMatch(/uploadFor=\{user\?\.id\}/);
  });
});

describe("R21-4 — Migration script idempotente e seguro", () => {
  const src = readFileSync(SCRIPT, "utf8");

  it("Shebang node + extensão .mjs", () => {
    expect(src.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("Exige SUPABASE_SERVICE_KEY (NÃO anon)", () => {
    expect(src).toMatch(/SUPABASE_SERVICE_KEY/);
    expect(src).toMatch(/aborta.*service|service.*role/i);
  });

  it("Aborta com exit 1 se env faltando", () => {
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it("Cliente Supabase com persistSession: false (sem token cache)", () => {
    expect(src).toMatch(/persistSession:\s*false/);
  });

  it("Filtra only 'data:image/%' (idempotente — já-migrados ficam fora)", () => {
    expect(src).toMatch(/\.like\("avatar_url",\s*"data:image\/%"\)/);
  });

  it("Parser data URL aceita jpeg/jpg/png/webp", () => {
    // Source tem `image\/(jpeg|jpg|png|webp)` — match no fragment legível.
    expect(src).toMatch(/jpeg\|jpg\|png\|webp/);
  });

  it("Upload com upsert true + cacheControl '3600'", () => {
    expect(src).toMatch(/upsert:\s*true/);
    expect(src).toMatch(/cacheControl:\s*["']3600["']/);
  });

  it("URL final inclui ?v=timestamp", () => {
    expect(src).toMatch(/\?v=\$\{Date\.now\(\)\}/);
  });

  it("Resumo no final: ok / skipped / failed", () => {
    expect(src).toMatch(/ok=\$\{ok\}\s+skipped=\$\{skipped\}\s+failed=\$\{failed\}/);
  });

  it("Erro num user NÃO derruba o batch", () => {
    // continue após log de erro, não throw
    expect(src).toMatch(/continue;/);
    expect(src).toMatch(/failed\+\+/);
  });
});

describe.skipIf(!HAS_SUPABASE)("R21-1 smoke real — bucket avatars existe em prod", () => {
  const supa = createClient(URL_, ANON);

  it("getPublicUrl pra qualquer path no bucket avatars retorna URL válida", () => {
    // Anon não consegue LISTAR buckets mas getPublicUrl é client-side,
    // confirma que a URL é montável. Se bucket não existe, a URL pode
    // até montar mas 404 ao acessar (não testamos aqui — só assinatura).
    const { data } = supa.storage.from("avatars").getPublicUrl("test/path.png");
    expect(data?.publicUrl).toBeTruthy();
    expect(data.publicUrl).toMatch(/\/storage\/v1\/object\/public\/avatars\/test\/path\.png/);
  });

  it("Anon SELECT em storage.objects do bucket avatars não dá erro", async () => {
    // RLS deixa ler (público). Lista vazia é OK (nenhuma foto ainda).
    const { error } = await supa.storage.from("avatars").list("", { limit: 1 });
    expect(error).toBeFalsy();
  });
});
