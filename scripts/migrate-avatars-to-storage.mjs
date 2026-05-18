#!/usr/bin/env node
// scripts/migrate-avatars-to-storage.mjs
//
// One-off pra migrar users.avatar_url de Base64 inline → Supabase Storage.
//
// USO:
//   1. Garante SUPABASE_URL e SUPABASE_SERVICE_KEY no env (NÃO o anon!)
//      export SUPABASE_URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2)
//      export SUPABASE_SERVICE_KEY=<da Supabase → Settings → API → service_role>
//   2. Roda:  node scripts/migrate-avatars-to-storage.mjs
//   3. Idempotente — pula users já migrados (avatar_url começa com http).
//
// Pré-requisito: bucket 'avatars' existir (R21-1 já criou). Script usa
// service_role pra bypassar RLS de Storage e atualizar users em bulk.
//
// Ordem:
//   1. SELECT users WHERE avatar_url LIKE 'data:image/%'
//   2. Pra cada:
//      a. Decoda Base64 → Buffer
//      b. Detecta MIME do prefix data URL
//      c. Upload pro bucket avatars/{id}/avatar.{ext} (upsert)
//      d. UPDATE users SET avatar_url = <publicUrl>?v=<timestamp>
//   3. Log progresso (1 linha por user)
//
// Sem rollback automático — se um upload falhar, loga e continua. Sidney
// inspeciona o log no fim.

import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!URL_) {
  console.error("ERRO: SUPABASE_URL (ou VITE_SUPABASE_URL) não setada.");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("ERRO: SUPABASE_SERVICE_KEY não setada.");
  console.error("Pega em https://supabase.com/dashboard → Settings → API → service_role.");
  console.error("NUNCA commitar essa key. Use só em scripts manuais.");
  process.exit(1);
}

const supa = createClient(URL_, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Extrai { mime, ext, bufferBase64 } de "data:image/jpeg;base64,XXXXX...".
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl ?? "");
  if (!m) return null;
  const mime = m[1].toLowerCase();
  let ext = m[2].toLowerCase();
  if (ext === "jpg") ext = "jpeg"; // padroniza ext final como jpg
  return { mime, ext: ext === "jpeg" ? "jpg" : ext, base64: m[3] };
}

async function migrate() {
  console.log("[migrate-avatars] start");

  // 1. Lista candidatos.
  const { data: users, error } = await supa
    .from("users")
    .select("id, nome, email, avatar_url")
    .like("avatar_url", "data:image/%")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[migrate-avatars] erro listando users:", error.message);
    process.exit(2);
  }

  if (!users?.length) {
    console.log("[migrate-avatars] nenhum user com Base64 inline. Nada a fazer.");
    process.exit(0);
  }

  console.log(`[migrate-avatars] ${users.length} users com Base64. Migrando…`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    const tag = `${u.email ?? u.id}`;
    const parsed = parseDataUrl(u.avatar_url);
    if (!parsed) {
      console.warn(`  - ${tag}: avatar_url não é data URL válido — pulando.`);
      skipped++;
      continue;
    }

    const buffer = Buffer.from(parsed.base64, "base64");
    const path = `${u.id}/avatar.${parsed.ext}`;
    const contentType = parsed.mime;

    // 2. Upload.
    const { error: upErr } = await supa.storage
      .from("avatars")
      .upload(path, buffer, { contentType, upsert: true, cacheControl: "3600" });
    if (upErr) {
      console.error(`  - ${tag}: upload erro — ${upErr.message}`);
      failed++;
      continue;
    }

    // 3. URL pública + UPDATE.
    const { data: publicData } = supa.storage.from("avatars").getPublicUrl(path);
    const baseUrl = publicData?.publicUrl;
    if (!baseUrl) {
      console.error(`  - ${tag}: getPublicUrl falhou`);
      failed++;
      continue;
    }
    const newUrl = `${baseUrl}?v=${Date.now()}`;

    const { error: dbErr } = await supa
      .from("users")
      .update({ avatar_url: newUrl })
      .eq("id", u.id);
    if (dbErr) {
      console.error(`  - ${tag}: UPDATE users erro — ${dbErr.message}`);
      failed++;
      continue;
    }

    console.log(`  ✓ ${tag}: migrado (${(buffer.length / 1024).toFixed(1)}KB → ${path})`);
    ok++;
  }

  console.log("");
  console.log(`[migrate-avatars] done — ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(3);
}

migrate().catch((e) => {
  console.error("[migrate-avatars] crash inesperado:", e);
  process.exit(99);
});
