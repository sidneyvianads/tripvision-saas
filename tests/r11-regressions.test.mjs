// Smoke tests R11 — anti-regressão pros 3 críticos verificados:
// - R11-1: create-subscription SITE_BASE env-aware (não hardcoded)
// - R11-2: useChat consolida em 1 channel `chat-${viagemId}`
// - R11-3: Welcome reage a isRecovering (sem listener duplo de PASSWORD_RECOVERY)

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATE_SUB = resolve(__dirname, "../netlify/functions/create-subscription.mjs");
const USE_CHAT = resolve(__dirname, "../src/hooks/useChat.js");
const WELCOME = resolve(__dirname, "../src/pages/Welcome.jsx");

describe("R11-1 — SITE_BASE env-aware (sem hardcoded preview→prod leak)", () => {
  const src = readFileSync(CREATE_SUB, "utf8");

  it("SITE_BASE lê process.env.URL ou DEPLOY_PRIME_URL antes do fallback", () => {
    // Padrão esperado: const SITE_BASE = process.env.URL || process.env.DEPLOY_PRIME_URL || "..."
    const m = src.match(/SITE_BASE\s*=\s*([^;]+);/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/process\.env\.URL/);
    expect(m[1]).toMatch(/DEPLOY_PRIME_URL/);
  });

  it("SITE_BASE NÃO é hardcoded apenas com 'https://viajjei.com.br'", () => {
    // Verifica que não existe uma linha "const SITE_BASE = \"https://viajjei.com.br\";"
    expect(src).not.toMatch(/const\s+SITE_BASE\s*=\s*["']https:\/\/viajjei\.com\.br["']\s*;/);
  });
});

describe("R11-2 — useChat consolida 2 channels em 1", () => {
  const src = readFileSync(USE_CHAT, "utf8");

  it("usa channel chat-{viagemId} unificado (não messages-{} + reactions-{})", () => {
    expect(src).toMatch(/channel\(`chat-\$\{viagemId\}`\)/);
    // O channel antigo separado não deve mais existir
    expect(src).not.toMatch(/channel\(`reactions-\$\{viagemId\}`\)/);
  });

  it("useChat agora tem só 1 removeChannel (consolidou 2→1)", () => {
    // O arquivo tem 2 hooks: useUnreadCount (1 removeChannel) e
    // useChat (antes 2 removeChannel, agora 1). Total: 2.
    // Pré-R11-2 era 3 (1 + 2).
    const cleanupMatches = src.match(/supabase\.removeChannel\(/g);
    expect(cleanupMatches).toBeTruthy();
    expect(cleanupMatches.length).toBe(2);
  });

  it("reactions INSERT tem filter client-side via setMessages.some", () => {
    // Pós-R11-2, o INSERT handler de reactions verifica se a msg está no
    // state local antes de atualizar. Defesa contra ruído de outras viagens.
    const insertIdx = src.indexOf('table: "reactions"');
    expect(insertIdx).toBeGreaterThan(-1);
    const segment = src.slice(insertIdx, insertIdx + 1500);
    // Procura padrão de filter (isOurMsg ou prevMsgs.some)
    expect(segment).toMatch(/prevMsgs\.some|isOurMsg/);
  });
});

describe("R11-3 — Welcome reage a isRecovering (sem listener duplo)", () => {
  const src = readFileSync(WELCOME, "utf8");

  it("Welcome importa isRecovering do useAuth", () => {
    expect(src).toMatch(/isRecovering\s*\}\s*=\s*useAuth\(\)/);
  });

  it("Welcome NÃO tem listener próprio de onAuthStateChange pra PASSWORD_RECOVERY", () => {
    // Antes: useEffect(() => { onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") ... })})
    // Agora: reage ao flag isRecovering via context
    expect(src).not.toMatch(/onAuthStateChange[\s\S]{0,200}PASSWORD_RECOVERY/);
  });

  it("Welcome usa effect com [isRecovering, mode] pra entrar em modo reset", () => {
    expect(src).toMatch(/isRecovering\s*&&\s*mode\s*!==?\s*["']reset["']/);
  });
});
