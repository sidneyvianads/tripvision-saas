import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON);

if (!isSupabaseConfigured) {
  console.warn("[Viajjei] VITE_SUPABASE_URL/ANON_KEY ausentes — modo offline.");
}

// R38: storage wrapper resiliente. Antes passávamos window.localStorage
// direto pro supabase client. Quando localStorage explode (Safari ITP
// SecurityError, Chrome com storage corrompido tipo JSON inválido em
// "viajjei.auth", quota cheia), o supabase-js trava em
// _emitInitialSession → toda query .from(..).select(..) fica pendurada
// pra sempre. Sintoma R34/R36/R37: spinner infinito nos forms de signup
// e na lista de afiliados, em Chrome E Safari.
//
// O R37 mitigou no InfluencerStep com timeout de 5s, mas era band-aid:
// o user via "Lista indisponível" e perdia o cupom. O fix de verdade
// é envolver storage com try/catch + fallback in-memory.
//
// Comportamento:
//   - getItem que throw OU retorna JSON inválido → in-memory return null
//   - setItem que throw → silenciosamente engole (session-only nessa aba)
//   - removeItem que throw → idem
//
// Trade-off: se localStorage está bloqueado, a sessão não persiste entre
// reloads (user precisa logar de novo). Mas o app NÃO TRAVA — comportamento
// drasticamente melhor que spinner infinito.
const memoryStore = new Map();
const resilientStorage = typeof window !== "undefined" ? {
  getItem(key) {
    try {
      const v = window.localStorage.getItem(key);
      // Sanity check: o supabase-js faz JSON.parse no value. Se está
      // corrompido (truncado, mistura de strings), o parse throw e
      // contamina o _emitInitialSession. Pré-validamos aqui — se não
      // for JSON válido, devolve null (= "sem sessão" pro supabase).
      if (v != null && key.includes("auth")) {
        try { JSON.parse(v); }
        catch {
          console.warn(`[supabase storage] key="${key}" corrupted, descartando`);
          try { window.localStorage.removeItem(key); } catch {}
          return null;
        }
      }
      return v;
    } catch (e) {
      console.warn(`[supabase storage] getItem("${key}") falhou, usando memory:`, e?.message);
      return memoryStore.get(key) ?? null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[supabase storage] setItem("${key}") falhou, salvando em memory:`, e?.message);
      memoryStore.set(key, value);
    }
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); } catch {}
    memoryStore.delete(key);
  },
} : undefined;

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
      storage: resilientStorage,
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
