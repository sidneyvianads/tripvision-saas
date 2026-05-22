// Smoke tests R40 — Gemini 2.5 Flash como modelo primário.
//
// Troca de Claude Haiku 4.5 → Gemini 2.5 Flash por custo (~3× mais
// barato). Haiku e GPT viram fallbacks. Infra multi-model preservada.
//
// Validação contra API real (rodada manualmente em 2026-05-21, não
// nestes smokes pra não consumir quota):
//   - Streaming: first chunk ~2s, total ~5s, 12 chunks
//   - Tags <viagem_update> e <roteiro_update>: JSON parsa OK
//   - Grounding: dispara em queries que exigem dados atuais (cotação
//     dólar → 2 queries, 5 chunks), NÃO dispara em prompts que o modelo
//     acha que sabe (recomendações → alucina URLs)
//   - Telemetria groundingMetadata captura corretamente

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETLIFY = resolve(__dirname, "../netlify/functions");
const PLAN = join(NETLIFY, "plan.mjs");
const CHAT = join(NETLIFY, "chat.mjs");

describe("R40 — plan.mjs com Gemini como primary", () => {
  const src = readFileSync(PLAN, "utf8");

  it("Comentário de cabeçalho atualizado: Gemini é PRIMARY", () => {
    expect(src).toMatch(/1\.\s*PRIMARY:\s*Google Gemini 2\.5 Flash/);
    expect(src).toMatch(/2\.\s*FALLBACK 1:\s*Anthropic Claude Haiku 4\.5/);
    expect(src).toMatch(/3\.\s*FALLBACK 2:\s*OpenAI GPT-4o-mini/);
  });

  it("Ordem dos providers: Gemini → Claude → OpenAI", () => {
    // Localiza o bloco que faz push(...) no array providers
    const block = src.match(/const providers = \[\];\s*([\s\S]+?)const providerErrors/);
    expect(block?.[1]).toBeTruthy();
    const lines = block[1].split("\n").filter((l) => l.includes("providers.push"));
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/Gemini 2\.5 Flash/);
    expect(lines[1]).toMatch(/Claude Haiku 4\.5/);
    expect(lines[2]).toMatch(/OpenAI GPT-4o-mini/);
  });

  it("Path primário (log) prefere Gemini sobre Claude e OpenAI", () => {
    const logBlock = src.match(/console\.log\([\s\S]{0,400}?Path primário[\s\S]+?\);/);
    expect(logBlock?.[0]).toBeTruthy();
    // hasGemini ? ... : hasAnthropic ? ... : ...
    expect(logBlock[0]).toMatch(/hasGemini\s*\?\s*["']\[JEI\] Path primário: Gemini 2\.5 Flash/);
  });

  it("Modelo gemini-2.5-flash usado (não 2.0, não preview)", () => {
    // Anti-regressão: 2.0 Flash é deprecated (shutdown 2026-06-01)
    expect(src).toMatch(/model:\s*["']gemini-2\.5-flash["']/);
    expect(src).not.toMatch(/gemini-2\.0/);
    expect(src).not.toMatch(/gemini-pro-preview/);
  });

  it("Tool googleSearch configurada", () => {
    expect(src).toMatch(/tools:\s*\[\{\s*googleSearch:\s*\{\}\s*\}\]/);
  });

  it("Log [JEI] modelo=X no sucesso (rastreabilidade)", () => {
    expect(src).toMatch(/console\.log\(`\[JEI\] modelo=\$\{p\.label\}`\)/);
  });

  it("Telemetria de grounding após o stream completar", () => {
    expect(src).toMatch(/groundingMetadata/);
    expect(src).toMatch(/\[JEI\/gemini\] grounding=/);
    expect(src).toMatch(/webSearchQueries/);
    expect(src).toMatch(/groundingChunks/);
  });

  it("Erro na telemetria de grounding NÃO quebra o stream (best-effort)", () => {
    // O try/catch envolvendo a leitura de groundingMetadata deve estar
    // DENTRO do try/catch externo do stream, e fazer só console.warn.
    const block = src.match(/try \{\s*const finalResp = await result\.response;[\s\S]+?\} catch \(telemetryErr\)/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/groundingMetadata/);
  });

  it("Claude Haiku 4.5 preservado como fallback (não deletado)", () => {
    expect(src).toMatch(/model:\s*["']claude-haiku-4-5["']/);
    expect(src).toMatch(/async function streamWithClaude/);
  });

  it("GPT-4o-mini preservado como fallback (não deletado)", () => {
    expect(src).toMatch(/model:\s*["']gpt-4o-mini["']/);
    expect(src).toMatch(/async function streamWithOpenAI/);
  });
});

describe("R40 — chat.mjs com Gemini como primary", () => {
  const src = readFileSync(CHAT, "utf8");

  it("Comentário de cabeçalho atualizado", () => {
    expect(src).toMatch(/1\.\s*PRIMARY:\s*Google Gemini 2\.5 Flash/);
  });

  it("Ordem dos providers: Gemini → Claude → OpenAI", () => {
    const block = src.match(/const providers = \[\];\s*([\s\S]+?)for \(let i/);
    expect(block?.[1]).toBeTruthy();
    const lines = block[1].split("\n").filter((l) => l.includes("providers.push"));
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/Gemini 2\.5 Flash/);
    expect(lines[1]).toMatch(/Claude Haiku 4\.5/);
    expect(lines[2]).toMatch(/OpenAI GPT-4o-mini/);
  });

  it("Log do path primário prefere Gemini", () => {
    const logBlock = src.match(/console\.log\([\s\S]{0,400}?\[JEI\/chat\] Path primário[\s\S]+?\);/);
    expect(logBlock?.[0]).toBeTruthy();
    expect(logBlock[0]).toMatch(/hasGemini\s*\?\s*["']\[JEI\/chat\] Path primário: Gemini 2\.5 Flash/);
  });

  it("Modelo gemini-2.5-flash + tool googleSearch", () => {
    expect(src).toMatch(/model:\s*["']gemini-2\.5-flash["']/);
    expect(src).toMatch(/tools:\s*\[\{\s*googleSearch:\s*\{\}\s*\}\]/);
  });

  it("Log [JEI/chat] modelo=X no sucesso", () => {
    expect(src).toMatch(/console\.log\(`\[JEI\/chat\] modelo=\$\{p\.label\}`\)/);
  });

  it("Telemetria de grounding também em chat (sem streaming)", () => {
    expect(src).toMatch(/\[JEI\/chat\/gemini\] grounding=/);
    expect(src).toMatch(/groundingMetadata/);
  });

  it("Claude Haiku 4.5 e GPT-4o-mini preservados como fallback", () => {
    expect(src).toMatch(/model:\s*["']claude-haiku-4-5["']/);
    expect(src).toMatch(/model:\s*["']gpt-4o-mini["']/);
    expect(src).toMatch(/async function replyWithClaude/);
    expect(src).toMatch(/async function replyWithOpenAI/);
  });
});

describe("R40 — anti-regressão (não removeu features existentes)", () => {
  const planSrc = readFileSync(PLAN, "utf8");
  const chatSrc = readFileSync(CHAT, "utf8");

  it("plan.mjs: SSE schema Anthropic ainda usado pro front", () => {
    expect(planSrc).toMatch(/sseTextDeltaEvent/);
  });

  it("plan.mjs: cache breakpoint Anthropic preservado (corte 80% input cost)", () => {
    expect(planSrc).toMatch(/buildMessagesWithCache/);
    expect(planSrc).toMatch(/cache_control:\s*\{\s*type:\s*["']ephemeral["']\s*\}/);
  });

  it("plan.mjs/chat.mjs: rate limit preservado", () => {
    expect(planSrc).toMatch(/rateLimit/);
    expect(chatSrc).toMatch(/rateLimit/);
  });

  it("plan.mjs: handler ainda devolve SSE 200 quando provider OK", () => {
    expect(planSrc).toMatch(/new Response\(stream,\s*\{\s*status:\s*200,\s*headers:\s*SSE_HEADERS\s*\}\)/);
  });

  it("plan.mjs/chat.mjs: erro 502 quando TODOS providers falham", () => {
    expect(planSrc).toMatch(/Todos os providers falharam/);
    expect(chatSrc).toMatch(/Todos os providers falharam/);
  });
});
