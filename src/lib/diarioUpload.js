// R22-2: upload de fotos do Diário pro bucket Storage 'diario'.
// Substitui Base64 inline em diario.fotos (JSONB) por URLs públicas.
//
// API:
//   const url = await uploadDiarioPhoto(file, viagemId, postId, idx);
//   const urls = await uploadDiarioPhotos(files, viagemId, postId);
//   await deleteDiarioPost(viagemId, postId);
//
// Path convention: diario/{viagemId}/{postId}/{idx}.{ext}
// O Composer (Diario.jsx) gera postId via crypto.randomUUID() ANTES do
// upload, depois usa o mesmo UUID na INSERT da tabela diario. Isso evita
// o "ovo-e-galinha" de ter que upar primeiro com path temporário.

import { supabase } from "./supabase";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const OUTPUT_MAX_DIM = 1920;   // preserva aspect ratio dentro de 1920×1920
const OUTPUT_QUALITY = 0.85;

function isWebPSupported() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  try {
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

// Resize preservando aspect ratio dentro de OUTPUT_MAX_DIM × OUTPUT_MAX_DIM.
// Diferente do avatar (crop center quadrado), fotos do diário mantêm
// o framing original — usuário pode ter tirado em vertical, horizontal, etc.
function resizeToBlob(file, mime, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { naturalWidth: w, naturalHeight: h } = img;
        // Scale down se exceder MAX_DIM em qualquer dimensão.
        if (w > OUTPUT_MAX_DIM || h > OUTPUT_MAX_DIM) {
          if (w >= h) { h = Math.round((h * OUTPUT_MAX_DIM) / w); w = OUTPUT_MAX_DIM; }
          else        { w = Math.round((w * OUTPUT_MAX_DIM) / h); h = OUTPUT_MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
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
 * Upa UMA foto pro bucket 'diario'. Faz resize + WebP encode.
 *
 * @param {File} file
 * @param {string} viagemId
 * @param {string} postId   UUID gerado pelo Composer ANTES do INSERT
 * @param {number} idx      0..4 (posição na grid de fotos)
 * @returns {Promise<string>} URL pública pronta pra gravar em fotos[].url
 */
export async function uploadDiarioPhoto(file, viagemId, postId, idx) {
  if (!file) throw new Error("Sem arquivo.");
  if (!viagemId || !postId) throw new Error("viagemId/postId obrigatórios.");
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("Formato não suportado. Use JPG, PNG ou WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Imagem muito grande. Máximo 5MB.");
  }

  const useWebP = isWebPSupported();
  const outputMime = useWebP ? "image/webp" : "image/jpeg";
  const ext = useWebP ? "webp" : "jpg";
  const blob = await resizeToBlob(file, outputMime, OUTPUT_QUALITY);

  const path = `${viagemId}/${postId}/${idx}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("diario")
    .upload(path, blob, {
      contentType: outputMime,
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) throw uploadErr;

  const { data: publicData } = supabase.storage.from("diario").getPublicUrl(path);
  if (!publicData?.publicUrl) throw new Error("Não consegui montar a URL pública.");
  return publicData.publicUrl;
}

/**
 * Upa N fotos em paralelo via Promise.all.
 *
 * @param {File[]} files
 * @param {string} viagemId
 * @param {string} postId
 * @returns {Promise<string[]>} array de URLs (na ordem dos files)
 */
export async function uploadDiarioPhotos(files, viagemId, postId) {
  if (!files?.length) return [];
  return Promise.all(
    files.map((file, idx) => uploadDiarioPhoto(file, viagemId, postId, idx))
  );
}

/**
 * Deleta TODAS as fotos de um post no Storage.
 * Lista o folder {viagemId}/{postId}/ e remove tudo.
 *
 * Importante: a RLS DELETE permite owner (uploader) OR admin da viagem.
 * Se a foto foi upada por um membro e o admin tenta deletar, funciona.
 * Se um membro normal tenta deletar foto de outro membro, falha.
 *
 * @param {string} viagemId
 * @param {string} postId
 */
export async function deleteDiarioPost(viagemId, postId) {
  if (!viagemId || !postId) return;
  const folder = `${viagemId}/${postId}`;
  // Lista o folder; pega até 10 entradas (limite Composer = 5).
  const { data: list, error: listErr } = await supabase.storage
    .from("diario")
    .list(folder, { limit: 10 });
  if (listErr) {
    console.warn("[diarioUpload] list erro (ignorado):", listErr.message);
    return;
  }
  if (!list?.length) return;
  const paths = list.map((f) => `${folder}/${f.name}`);
  const { error: rmErr } = await supabase.storage.from("diario").remove(paths);
  if (rmErr) {
    console.warn("[diarioUpload] remove erro (ignorado):", rmErr.message);
  }
}
