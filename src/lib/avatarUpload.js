// R21-2: upload de avatar pro Supabase Storage bucket 'avatars'.
// Substitui fileToResizedDataUrl (Base64 inline em users.avatar_url) por
// upload de WebP comprimido + URL pública persistida.
//
// API:
//   const { url } = await uploadAvatar(userId, file);
//   await deleteAvatar(userId);
//
// uploadAvatar:
//   1. Valida tamanho ≤ 2MB e MIME (jpeg/png/webp)
//   2. Resize 256×256 crop center, qualidade alta (Avatar component max é 96px,
//      256 cobre retina + scale 2× sem perda visível)
//   3. Encoda como WebP (~30-40% menor que JPEG mesma qualidade)
//      ou JPEG fallback (Safari iOS <16 não tem encoder WebP)
//   4. Upload pra avatars/{userId}/avatar.{ext} (upsert)
//   5. Retorna { url } da URL pública

import { supabase } from "./supabase";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const OUTPUT_SIZE = 256;
const OUTPUT_QUALITY = 0.85;

function isWebPSupported() {
  // Safari iOS 14-15 não suporta encoder WebP via canvas.toBlob. Detectamos
  // via toDataURL — se o browser não suportar, retorna prefix "data:image/png".
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  try {
    const url = canvas.toDataURL("image/webp");
    return url.startsWith("data:image/webp");
  } catch {
    return false;
  }
}

// Resize + crop center quadrado pra `OUTPUT_SIZE`. Retorna Blob.
function resizeToBlob(file, mime, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const minSide = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - minSide) / 2;
        const sy = (img.naturalHeight - minSide) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Conversão falhou."));
            resolve(blob);
          },
          mime,
          quality,
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui ler a imagem."));
    };
    img.src = url;
  });
}

/**
 * Upa avatar pro bucket 'avatars'. Faz resize + compressão.
 * Retorna a URL pública pra gravar em users.avatar_url.
 *
 * @param {string} userId
 * @param {File} file
 * @returns {Promise<{ url: string, path: string }>}
 */
export async function uploadAvatar(userId, file) {
  if (!userId) throw new Error("Não logado.");
  if (!file) throw new Error("Sem arquivo.");
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("Formato não suportado. Use JPG, PNG ou WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Imagem muito grande. Máximo 2MB.");
  }

  const useWebP = isWebPSupported();
  const outputMime = useWebP ? "image/webp" : "image/jpeg";
  const ext = useWebP ? "webp" : "jpg";
  const blob = await resizeToBlob(file, outputMime, OUTPUT_QUALITY);

  // Path: avatars/{userId}/avatar.{ext}. RLS policy só deixa upar no
  // próprio folder (storage.foldername[1] = auth.uid()).
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(path, blob, {
      contentType: outputMime,
      upsert: true,
      cacheControl: "3600", // 1h — quando trocar avatar, busta via query string ?v=timestamp
    });
  if (uploadErr) throw uploadErr;

  // URL pública. Adiciona ?v=timestamp pra busta cache quando troca foto.
  const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
  const baseUrl = publicData?.publicUrl ?? "";
  if (!baseUrl) throw new Error("Não consegui montar a URL pública.");
  const url = `${baseUrl}?v=${Date.now()}`;
  return { url, path };
}

/**
 * Remove avatar do Storage + zera users.avatar_url.
 * Tenta os 3 paths possíveis (webp, jpg, png) por idempotência —
 * usuário pode ter migrado entre formatos.
 *
 * @param {string} userId
 */
export async function deleteAvatar(userId) {
  if (!userId) throw new Error("Não logado.");
  const paths = [
    `${userId}/avatar.webp`,
    `${userId}/avatar.jpg`,
    `${userId}/avatar.png`,
  ];
  const { error: storageErr } = await supabase.storage.from("avatars").remove(paths);
  // Ignora erro "Object not found" — só nos importa que o path final fique vazio.
  if (storageErr && !/not found/i.test(storageErr.message ?? "")) {
    console.warn("[avatarUpload] delete storage erro (ignorado):", storageErr);
  }
  const { error: dbErr } = await supabase
    .from("users")
    .update({ avatar_url: null })
    .eq("id", userId);
  if (dbErr) throw dbErr;
}
