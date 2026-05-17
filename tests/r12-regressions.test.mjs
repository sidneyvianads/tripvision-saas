// Smoke tests R12 — anti-regressão pros 4 críticos:
// - R12-1: useChat usa refs (messagesRef, pendingReactionsRef) e cobre race
//          reaction-antes-de-message + remove setter aninhado anti-pattern.
// - R12-2/4: signOut chama clearSessionScopedStorage de src/lib/storage.js
//            (fonte única de verdade pras keys de sessão).
// - R12-3: og.mjs (Deno edge) prefere SUPABASE_ANON_KEY canônica antes do
//          VITE_SUPABASE_ANON_KEY (Deno runtime não expõe VITE_* default).
// - R12-6: netlify.toml tem Content-Security-Policy connect-src + index.html
//          tem preconnect pra Supabase.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USE_CHAT = resolve(__dirname, "../src/hooks/useChat.js");
const USE_AUTH = resolve(__dirname, "../src/hooks/useAuth.jsx");
const STORAGE_LIB = resolve(__dirname, "../src/lib/storage.js");
const OG_EDGE = resolve(__dirname, "../netlify/edge-functions/og.mjs");
const NETLIFY_TOML = resolve(__dirname, "../netlify.toml");
const INDEX_HTML = resolve(__dirname, "../index.html");

describe("R12-1 — useChat buffer reactions órfãs + messagesRef (sem setter aninhado)", () => {
  const src = readFileSync(USE_CHAT, "utf8");

  it("importa useRef do react", () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*["']react["']/);
  });

  it("declara messagesRef e pendingReactionsRef", () => {
    expect(src).toMatch(/const\s+messagesRef\s*=\s*useRef\(\s*\[\s*\]\s*\)/);
    expect(src).toMatch(/const\s+pendingReactionsRef\s*=\s*useRef\(\s*\[\s*\]\s*\)/);
  });

  it("mantém messagesRef.current sync via effect sem deps", () => {
    expect(src).toMatch(/messagesRef\.current\s*=\s*messages/);
  });

  it("reactions INSERT lê messagesRef em vez de setMessages aninhado", () => {
    // R12-1 substituiu setMessages(prev => { ... setReactionsByMsg(); return prev }) por
    // messagesRef.current.some(...). Garantimos que o callback de reactions NÃO chama
    // setMessages com return prev (anti-pattern).
    const reactionsBlock = src.match(
      /table:\s*["']reactions["'][^}]*\}\s*,\s*\(payload\)[\s\S]{0,1200}?\}\s*\)/
    );
    expect(reactionsBlock?.[0]).toBeTruthy();
    expect(reactionsBlock[0]).toMatch(/messagesRef\.current\.some/);
  });

  it("buferiza reactions órfãs (cap 100) e drena no INSERT da msg", () => {
    expect(src).toMatch(/pendingReactionsRef\.current\.length\s*<\s*100/);
    expect(src).toMatch(/pendingReactionsRef\.current\.push/);
    // No INSERT de message DENTRO do chatChannel (não no useUnreadCount,
    // que também tem `table: "messages"`), deve drenar o buffer de órfãs.
    // Ancoramos a partir do chatChannel pra ignorar useUnreadCount.
    const chatChannelIdx = src.indexOf("chatChannel");
    expect(chatChannelIdx).toBeGreaterThan(-1);
    const fromChatChannel = src.slice(chatChannelIdx);
    const messagesBlock = fromChatChannel.match(
      /table:\s*["']messages["'][\s\S]+?(?=\.on\(|\.subscribe\()/
    );
    expect(messagesBlock?.[0]).toBeTruthy();
    expect(messagesBlock[0]).toMatch(/pendingReactionsRef\.current\.filter/);
  });

  it("DELETE de reaction limpa também do buffer", () => {
    const deleteBlock = src.match(
      /event:\s*["']DELETE["'][^}]*table:\s*["']reactions["'][\s\S]{0,800}?\}\s*\)/
    );
    expect(deleteBlock?.[0]).toMatch(/pendingReactionsRef\.current\s*=\s*pendingReactionsRef\.current\.filter/);
  });
});

describe("R12-2/4 — signOut limpa storage residual via storage.js", () => {
  const authSrc = readFileSync(USE_AUTH, "utf8");
  const storageSrc = readFileSync(STORAGE_LIB, "utf8");

  it("src/lib/storage.js exporta SESSION_SCOPED_KEYS e clearSessionScopedStorage", () => {
    expect(storageSrc).toMatch(/export\s+const\s+SESSION_SCOPED_KEYS/);
    expect(storageSrc).toMatch(/export\s+function\s+clearSessionScopedStorage/);
  });

  it("lista cupom/origem/plan-usage como keys fixas", () => {
    expect(storageSrc).toMatch(/["']viajjei:cupom["']/);
    expect(storageSrc).toMatch(/["']viajjei:origem["']/);
    expect(storageSrc).toMatch(/["']tripvision-saas:plan-usage:v3["']/);
  });

  it("roteiro:* entra como prefix (sufixo dinâmico por viagemId)", () => {
    expect(storageSrc).toMatch(/SESSION_SCOPED_PREFIXES[\s\S]{0,200}["']tripvision:roteiro:["']/);
  });

  it("NÃO inclui viajjei.consent_analytics nem viajjei.auth (LGPD + supabase auth)", () => {
    // Cookie consent é do dispositivo, supabase.auth.signOut trata sua key.
    // Extraímos só o array literal (a partir do = até o ];) pra não casar
    // contra o comentário que explica POR QUE essas keys ficam de fora.
    const arrayLiteral = storageSrc.match(
      /SESSION_SCOPED_KEYS\s*=\s*Object\.freeze\(\[([\s\S]+?)\]\s*\)/
    );
    expect(arrayLiteral?.[1]).toBeTruthy();
    expect(arrayLiteral[1]).not.toMatch(/consent_analytics/);
    expect(arrayLiteral[1]).not.toMatch(/viajjei\.auth/);
  });

  it("useAuth importa e chama clearSessionScopedStorage no signOut", () => {
    expect(authSrc).toMatch(
      /import\s*\{\s*clearSessionScopedStorage\s*\}\s*from\s*["']\.\.\/lib\/storage["']/
    );
    const signOutBlock = authSrc.match(/const\s+signOut\s*=[\s\S]{0,500}?\}\s*,\s*\[\s*\]\s*\)/);
    expect(signOutBlock?.[0]).toMatch(/clearSessionScopedStorage\(\)/);
  });

  it("try/catch envolve o removeItem (Safari ITP-safe)", () => {
    // O wipe em si fica dentro de try{} no helper; basta confirmar que existe.
    expect(storageSrc).toMatch(/try\s*\{[\s\S]+removeItem[\s\S]+\}\s*catch/);
  });
});

describe("R12-3 — og.mjs Deno edge prefere SUPABASE_ANON_KEY canônica", () => {
  const src = readFileSync(OG_EDGE, "utf8");

  it("SUPABASE_KEY: SUPABASE_ANON_KEY ANTES de VITE_SUPABASE_ANON_KEY", () => {
    // Ordem de fallback importa — Deno edge runtime pode não ter VITE_*
    // expostos a depender do scope do env no Netlify.
    const match = src.match(/const\s+SUPABASE_KEY\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    const idxCanonical = match[1].indexOf("SUPABASE_ANON_KEY");
    const idxViteAnon = match[1].indexOf("VITE_SUPABASE_ANON_KEY");
    expect(idxCanonical).toBeGreaterThan(-1);
    expect(idxViteAnon).toBeGreaterThan(-1);
    // A primeira ocorrência de SUPABASE_ANON_KEY (não VITE_) vem antes do VITE_*.
    // Como "VITE_SUPABASE_ANON_KEY" contém "SUPABASE_ANON_KEY", precisamos achar
    // o primeiro Deno.env.get("SUPABASE_ANON_KEY") (sem prefixo).
    const canonicalCall = match[1].indexOf('Deno.env.get("SUPABASE_ANON_KEY")');
    const viteCall = match[1].indexOf('Deno.env.get("VITE_SUPABASE_ANON_KEY")');
    expect(canonicalCall).toBeGreaterThan(-1);
    expect(viteCall).toBeGreaterThan(-1);
    expect(canonicalCall).toBeLessThan(viteCall);
  });

  it("SUPABASE_URL: SUPABASE_URL ANTES de VITE_SUPABASE_URL (já existia, anti-regressão)", () => {
    const match = src.match(/const\s+SUPABASE_URL\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    const canonicalCall = match[1].indexOf('Deno.env.get("SUPABASE_URL")');
    const viteCall = match[1].indexOf('Deno.env.get("VITE_SUPABASE_URL")');
    expect(canonicalCall).toBeGreaterThan(-1);
    expect(viteCall).toBeGreaterThan(-1);
    expect(canonicalCall).toBeLessThan(viteCall);
  });
});

describe("R12-6 — CSP connect-src + preconnect Supabase", () => {
  const toml = readFileSync(NETLIFY_TOML, "utf8");
  const html = readFileSync(INDEX_HTML, "utf8");

  it("netlify.toml tem Content-Security-Policy com connect-src", () => {
    expect(toml).toMatch(/Content-Security-Policy\s*=\s*["'][^"']*connect-src/);
  });

  it("CSP whitelista Supabase https + wss + 'self'", () => {
    // CSP toml value vem entre aspas duplas e contém apostrofes ('self').
    const cspLine = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
    expect(cspLine).toBeTruthy();
    expect(cspLine[1]).toMatch(/'self'/);
    expect(cspLine[1]).toMatch(/https:\/\/[^\s]*\.supabase\.co/);
    expect(cspLine[1]).toMatch(/wss:\/\/[^\s]*\.supabase\.co/);
  });

  it("CSP NÃO contém default-src nem script-src (só connect-src — escopo controlado)", () => {
    // CSP toml value vem entre aspas duplas e contém apostrofes ('self').
    const cspLine = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
    // Estratégia explícita: outros recurso-types ficam abertos pra evitar
    // quebrar inline scripts do Vite, imagens externas, etc. Quando
    // expandirmos, este teste vira o lembrete de revisar.
    expect(cspLine[1]).not.toMatch(/default-src/);
    expect(cspLine[1]).not.toMatch(/script-src/);
  });

  it("index.html tem preconnect pra supabase.co com crossorigin", () => {
    expect(html).toMatch(/rel=["']preconnect["'][^>]*supabase\.co[^>]*crossorigin/);
  });
});
