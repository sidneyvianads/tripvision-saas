#!/usr/bin/env node
// scripts/migrate-diario-photos-to-storage.mjs
//
// One-off pra migrar diario.fotos de Base64 inline (JSONB array de
// strings "data:image/...") → URLs públicas do Supabase Storage.
//
// USO:
//   export SUPABASE_URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2)
//   export SUPABASE_SERVICE_KEY=<service_role da dashboard → Settings → API>
//   node scripts/migrate-diario-photos-to-storage.mjs
//
// Pré-requisito: bucket 'diario' existir (R22-1 já criou).
//
// Schema final em diario.fotos:
//   [{ url: "https://...storage.../diario/{viagem_id}/{post_id}/{idx}.{ext}",
//      legenda?: string }]
//
// Posts com array misto (algumas Base64, algumas já com .url) são
// processados parcial — só migra os Base64 restantes. Idempotente.
//
// Ordem:
//   1. SELECT diario WHERE alguma foto começa com "data:image/"
//   2. Pra cada post:
//      a. Pra cada foto:
//         - Se já é { url } ou string http(s)://, pula
//         - Se é string "data:..." ou { base64 }, decoda e upa
//      b. UPDATE diario SET fotos = <array novo>
//   3. Log: posts processados, fotos migradas, falhas

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

// Extrai { mime, ext, base64 } de "data:image/jpeg;base64,XXXXX...".
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl ?? "");
  if (!m) return null;
  const mime = m[1].toLowerCase();
  let ext = m[2].toLowerCase();
  if (ext === "jpeg") ext = "jpg";  // padroniza
  return { mime, ext, base64: m[3] };
}

// Normaliza um item do array fotos pra { url, legenda? }.
// Aceita: string Base64, string URL, { base64 }, { url }.
function normalizeFotoItem(foto) {
  if (!foto) return null;
  if (typeof foto === "string") {
    if (foto.startsWith("http://") || foto.startsWith("https://")) {
      return { url: foto };
    }
    if (foto.startsWith("data:image/")) {
      return { base64: foto };
    }
    return null;
  }
  if (typeof foto === "object") {
    if (foto.url) return { url: foto.url, legenda: foto.legenda };
    if (foto.base64) return { base64: foto.base64, legenda: foto.legenda };
  }
  return null;
}

async function migratePost(post) {
  const original = Array.isArray(post.fotos) ? post.fotos : [];
  if (!original.length) return { migrated: 0, newFotos: [] };

  const newFotos = [];
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < original.length; i++) {
    const item = normalizeFotoItem(original[i]);
    if (!item) {
      console.warn(`  - post ${post.id} foto[${i}] inválida — pulando`);
      continue;
    }
    if (item.url) {
      // Já migrada — preserva.
      newFotos.push({ url: item.url, ...(item.legenda ? { legenda: item.legenda } : {}) });
      continue;
    }
    // Base64 → upload.
    const parsed = parseDataUrl(item.base64);
    if (!parsed) {
      console.warn(`  - post ${post.id} foto[${i}] data URL inválido — pulando`);
      failed++;
      continue;
    }
    const buffer = Buffer.from(parsed.base64, "base64");
    const path = `${post.viagem_id}/${post.id}/${i}.${parsed.ext}`;
    const { error: upErr } = await supa.storage
      .from("diario")
      .upload(path, buffer, { contentType: parsed.mime, upsert: true, cacheControl: "3600" });
    if (upErr) {
      console.error(`  - post ${post.id} foto[${i}] upload erro — ${upErr.message}`);
      failed++;
      continue;
    }
    const { data: publicData } = supa.storage.from("diario").getPublicUrl(path);
    const url = publicData?.publicUrl;
    if (!url) {
      console.error(`  - post ${post.id} foto[${i}] getPublicUrl falhou`);
      failed++;
      continue;
    }
    newFotos.push({ url, ...(item.legenda ? { legenda: item.legenda } : {}) });
    migrated++;
  }

  return { migrated, failed, newFotos };
}

async function run() {
  console.log("[migrate-diario] start");

  // Lê todos os posts com fotos. Filtrar Base64 no JSONB direto é
  // complexo — pega tudo e filtra no JS. Dataset Pequeno (max 200/viagem,
  // 1 viagem ativa hoje).
  const { data: posts, error } = await supa
    .from("diario")
    .select("id, viagem_id, fotos")
    .not("fotos", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[migrate-diario] erro listando posts:", error.message);
    process.exit(2);
  }

  // Filtro: só posts com pelo menos 1 foto Base64 (string "data:" ou {base64}).
  const candidates = (posts ?? []).filter((p) => {
    const fotos = Array.isArray(p.fotos) ? p.fotos : [];
    return fotos.some((f) => {
      if (typeof f === "string") return f.startsWith("data:image/");
      if (f && typeof f === "object" && f.base64) return true;
      return false;
    });
  });

  if (!candidates.length) {
    console.log("[migrate-diario] nenhum post com Base64. Nada a fazer.");
    process.exit(0);
  }

  console.log(`[migrate-diario] ${candidates.length} posts com fotos Base64. Migrando…`);

  let totalMigrated = 0;
  let totalFailed = 0;
  let postsOk = 0;
  let postsFailed = 0;

  for (const post of candidates) {
    const { migrated, failed, newFotos } = await migratePost(post);
    if (migrated === 0 && failed > 0) {
      console.error(`  ✗ post ${post.id}: nenhuma foto migrou (${failed} falhas) — pulando UPDATE`);
      postsFailed++;
      totalFailed += failed;
      continue;
    }
    const { error: dbErr } = await supa
      .from("diario")
      .update({ fotos: newFotos })
      .eq("id", post.id);
    if (dbErr) {
      console.error(`  ✗ post ${post.id}: UPDATE diario erro — ${dbErr.message}`);
      postsFailed++;
      continue;
    }
    console.log(`  ✓ post ${post.id}: ${migrated} foto(s) migrada(s)${failed ? `, ${failed} falha(s)` : ""}`);
    postsOk++;
    totalMigrated += migrated;
    totalFailed += failed;
  }

  console.log("");
  console.log(`[migrate-diario] done — posts ok=${postsOk} failed=${postsFailed} · fotos migradas=${totalMigrated} falhas=${totalFailed}`);
  if (postsFailed > 0 || totalFailed > 0) process.exit(3);
}

run().catch((e) => {
  console.error("[migrate-diario] crash inesperado:", e);
  process.exit(99);
});
