import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON);

if (!isSupabaseConfigured) {
  console.warn("[Viajjei] VITE_SUPABASE_URL/ANON_KEY ausentes — modo offline.");
}

// Auth nativo do Supabase: persistSession + autoRefreshToken pra sessão
// durar com JWT renovado automaticamente. detectSessionInUrl: true ativa
// o handshake do flow de reset de senha (link no email volta com
// #access_token=... + type=recovery).
export const supabase = createClient(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_ANON ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: "viajjei.auth",
    },
  }
);

const INVISIBLE_CODEPOINTS = [0x00a0, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
const INVISIBLE_CHARS_RE = new RegExp(
  "[" + INVISIBLE_CODEPOINTS.map((cp) => "\\u" + cp.toString(16).padStart(4, "0")).join("") + "]",
  "g"
);

export function normalizePassword(s) {
  return (s ?? "").normalize("NFC").replace(INVISIBLE_CHARS_RE, "").trim();
}

export function normalizeEmail(s) {
  return (s ?? "").normalize("NFC").replace(INVISIBLE_CHARS_RE, "").trim().toLowerCase();
}

export function fileToResizedDataUrl(file, size = 200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Sem arquivo."));
    if (!file.type?.startsWith("image/")) return reject(new Error("Arquivo precisa ser uma imagem."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const minSide = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - minSide) / 2;
        const sy = (img.naturalHeight - minSide) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
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

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export function randomSlug(len = 8) {
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (const b of buf) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}
