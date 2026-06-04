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

// R39: purge eager de token corrompido ANTES do supabase-js tentar ler.
//
// Cenário real (Sidney em 2026-05-20): dezenas de testes seguidos em dev
// deixaram um JWT lixo em localStorage["viajjei.auth"]. O R38 cobre o
// caso de JSON malformado, mas NÃO cobre JSON válido com payload absurdo
// (token sem refresh_token, ou expirado há semanas, ou access_token sem
// formato JWT). Nesse caso o supabase-js carrega "session válida" do
// storage, anexa Authorization: Bearer <lixo> em toda request, e o
// servidor às vezes trava (proxy chain) em vez de retornar 401 rápido.
//
// Aqui validamos a estrutura mínima ANTES de criar o client. Se faltar
// campo essencial OU access_token não parecer JWT (3 partes base64) OU
// payload exp é absurdamente antigo (> 7d, fora da janela de refresh),
// limpamos do storage. Supabase boot vai como anônimo, limpo.
//
// IMPORTANTE: não removemos tokens RECENTEMENTE expirados (< 7d) — o
// refresh_token pode renovar. Só descartamos lixo evidente.
function purgeCorruptedAuthToken(storageKey) {
  if (typeof window === "undefined") return;
  let raw;
  try { raw = window.localStorage.getItem(storageKey); }
  catch { return; } // storage bloqueado, resilientStorage cuida disso depois
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") {
      throw new Error("not an object");
    }
    if (!obj.access_token || !obj.refresh_token) {
      throw new Error("missing access_token or refresh_token");
    }
    const parts = String(obj.access_token).split(".");
    if (parts.length !== 3) {
      throw new Error("access_token não tem 3 partes (não é JWT)");
    }
    // Decode do payload do JWT pra checar exp.
    // atob não suporta base64url, normalizamos antes.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice((b64.length + 2) % 4);
    const payload = JSON.parse(atob(padded));
    const nowSec = Math.floor(Date.now() / 1000);
    const SEVEN_DAYS = 7 * 24 * 3600;
    if (typeof payload.exp === "number" && (nowSec - payload.exp) > SEVEN_DAYS) {
      throw new Error(`expirou há ${nowSec - payload.exp}s (fora da janela de refresh)`);
    }
  } catch (e) {
    console.warn(`[supabase] storage "${storageKey}" inválido (${e?.message}), limpando antes do boot`);
    try { window.localStorage.removeItem(storageKey); } catch {}
  }
}

// Roda ANTES do createClient — supabase-js lê o storage no construtor.
purgeCorruptedAuthToken("viajjei.auth");

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

// R39: helper pra queries que SÃO públicas (RLS permite anon) mas o
// supabase-js pode estar tentando autenticar com token corrompido que o
// purge eager não pegou (ex: token revogado no servidor que ainda parece
// válido localmente). Se a query falha com erro de auth (PGRST301/302
// ou code 42501), limpa session e retenta uma vez como anônimo puro.
//
// Códigos cobertos:
//   - PGRST301: JWT expired (PostgREST reject)
//   - PGRST302: JWT invalid (PostgREST reject)
//   - 42501:    permission denied (RLS reject — pode ser por role errado)
//
// Uso:
//   const result = await runPublicQuery(() =>
//     supabase.from("afiliados").select("...").eq("ativo", true)
//   );
//   if (result.error) { ... }
//   const list = result.data;
export async function runPublicQuery(queryFn) {
  const first = await queryFn();
  if (!first.error) return first;

  const code = first.error?.code;
  const looksAuth = code === "PGRST301" || code === "PGRST302" || code === "42501";
  if (!looksAuth) return first;

  console.warn(`[supabase] query pública falhou com auth code=${code}, limpando session e retentando`);
  try { await supabase.auth.signOut({ scope: "local" }); }
  catch (e) { console.warn("[supabase] signOut falhou (ignorando):", e?.message); }
  // signOut local também limpa o storage via resilientStorage.removeItem
  return await queryFn();
}

// R41: timeout pra chamadas auth do supabase-js que podem TRAVAR pra
// sempre. updateUser() e getSession() fazem `await this.initializePromise`
// internamente ANTES do timeout de lock interno (5s). Se a hidratação
// travou — Safari ITP / storage bloqueado, MESMO cenário do R36/R38 —
// a initializePromise NUNCA resolve e a chamada fica pendurada: sem erro,
// sem sucesso, sem nada. Foi exatamente o sintoma do R41: o botão
// "Atualizar senha" não fazia nada (sem loading, sem erro visível).
//
// Confirmado empiricamente (repro com storage que nunca resolve): o
// updateUser fica unsettled indefinidamente. withTimeout força uma
// REJEIÇÃO após `ms`, transformando o silêncio infinito num erro visível.
//
// A mensagem é repassada como Error.message já em PT-BR amigável. NÃO
// usamos a palavra "timeout" nem name="TimeoutError" de propósito: o
// friendlyError() casaria pelo name/marker técnico e trocaria pelo texto
// genérico "Servidor demorou pra responder", perdendo a instrução
// específica (ex: "abra o link do email de novo"). Marcamos com a flag
// `isTimeout` pra checagem programática/testes sem afetar o name.
export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message);
      err.isTimeout = true;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
