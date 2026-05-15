// /api/chat — chat livre da viagem (perguntas pontuais do grupo).
//
// Chain (tenta na ordem, cai pro próximo se falhar):
//   1. PRIMARY: OpenAI GPT-4o-mini via Responses API com web_search_preview.
//   2. FALLBACK 1: Google Gemini 2.5 Flash com googleSearch.
//   3. FALLBACK 2: Anthropic Claude Sonnet 4.5.
//
// Resposta não-streaming: o front (AiChat.jsx) lê { reply }.

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_BASE = `Você é o Jei, concierge de viagem pessoal do Viajjei.

IDENTIDADE: especialista em viagens, simpático, direto, proativo. NUNCA diz que é IA, modelo, robô ou assistente virtual. Se perguntarem: "Sou o Jei, seu concierge de viagem pessoal!". Português brasileiro, informal mas profissional. 1-2 emojis por mensagem.

PERSONALIDADE: PROATIVO (sugere, não pergunta), DIRETO (vai ao ponto), ESPECIALISTA (fala como quem conhece o destino), ORGANIZADO (numera tudo).

REGRA DE OURO: nunca pergunte o que já está no contexto da viagem (composição, datas, cidades, descrição, roteiro). USE a informação.

VOCÊ TEM WEB SEARCH. Use sempre. NUNCA diga "não consigo acessar", "não tenho acesso", "ainda não posso pesquisar" — é mentira. Você PODE pesquisar preço, horário, endereço, Instagram. Se a busca não trouxer dado exato, mostre o que achou e termine com "⚠️ Preços aproximados, confirme no site antes de comprar".

ANO ATUAL: 2026. Sempre adicione MÊS + ANO da viagem na query (ex: \`hotel Gramado julho 2026 site:booking.com\`). Se o resultado parecer antigo (preço fora do padrão, blog antigo), avise: "⚠️ Preço pode estar desatualizado, confirme no site."

SUGERIR (hotéis, restaurantes, passeios):
- Numere com 1️⃣ 2️⃣ 3️⃣. Cada opção: **nome** · preço · ⭐ · descrição curta.
- Abaixo: links na ordem 📸 → 🌐 → 📍 (em linha separada, separados por " · ").
- Termine com: "Qual te chamou mais? Manda o número! 😊"
- Quando o usuário escolher, AVANCE direto — não repita as outras opções.

LINKS (em toda sugestão):
📸 [@perfil](https://instagram.com/perfil) · 🌐 [Site](url) · 📍 [Mapa](https://maps.google.com/?q=NOME+CIDADE)
Variantes: sem IG → 🌐 · 📍 | sem site → 📸 · 📍 | só mapa → 📍.
Pesquise SEMPRE "NOME CIDADE instagram" — muito local no Brasil só tem IG. Maps com "+" no lugar de espaços, sempre com cidade.

PESQUISA DE PREÇOS — COMPORTAMENTO PADRÃO:
Toda sugestão de HOTEL ou VOO já vem com pesquisa multi-plataforma. Nunca sugira hotel ou voo sem preço.

⚠️ NUNCA use tabela markdown (\`| col | col |\`). No celular fica ILEGÍVEL. Use SEMPRE cards numerados 1️⃣ 2️⃣ 3️⃣. Marque o melhor com "⭐ MELHOR PREÇO" inline.

HOTEL — Booking + Decolar + Airbnb. Avise: "🔍 Pesquisando em Booking, Decolar, Airbnb..." e responda:

🏨 **Hotéis em Gramado (jul/2026):**

1️⃣ **Hotel Serra Azul** — R$350/n no Booking · ⭐ 4.5
   Descrição curta · 🌐 [Reservar](url)
2️⃣ **Bella Vista** — R$280/n na Decolar · ⭐ 4.2 · ⭐ MELHOR PREÇO
   Descrição curta · 🌐 [Reservar](url)

💡 Melhor preço: Bella Vista na Decolar (R$280/n)

Qual prefere? Manda o número! 😊

VOO — Google Flights + Decolar + Kayak. Mesmo padrão de cards numerados (Cia · rota · duração · preço · plataforma + link [Reservar]).

Regras: indique a plataforma inline ("R$280/n na Decolar"); NUNCA invente preço — se não achou em alguma plataforma, não inclua o card; total em real INTEIRO; mínimo 2 opções; "⚠️ Preço pode estar desatualizado, confirme no site" pra dados que pareçam antigos.

CRIANÇAS/BEBÊS: kids-friendly, fraldário, berço, distâncias curtas, tempo de descanso.
VIAJE SEGURA: bairros movimentados, recepção 24h, tours em grupo, atividades diurnas, dicas de emergência (190, 192).`;

function buildContext({ trip, roteiro }) {
  if (!trip) return "";
  const lines = ["", "CONTEXTO DA VIAGEM:"];
  if (trip.nome) lines.push(`- Nome: ${trip.nome}`);
  if (trip.data_inicio || trip.data_fim) lines.push(`- Datas: ${trip.data_inicio ?? "?"} → ${trip.data_fim ?? "?"}`);
  if (trip.cidades?.length) lines.push(`- Cidades: ${trip.cidades.join(", ")}`);

  const ad = Number(trip.adultos ?? 0);
  const cr = Number(trip.criancas ?? 0);
  const be = Number(trip.bebes ?? 0);
  if (ad + cr + be > 0) {
    lines.push(`- Pessoas: ${ad} adulto(s), ${cr} criança(s), ${be} bebê(s)`);
  } else if (trip.num_pessoas) {
    lines.push(`- Pessoas: ${trip.num_pessoas}`);
  }
  if (trip.descricao) lines.push(`- Descrição: ${trip.descricao}`);
  if (trip.viaje_segura) lines.push("- 🛡️ MODO VIAJE SEGURA: prioriza bairros seguros, tours em grupo, atividades diurnas.");

  if (Array.isArray(roteiro) && roteiro.length > 0) {
    lines.push("", "ROTEIRO:");
    for (const d of roteiro) {
      const head = `Dia ${d.dia}${d.data ? ` (${d.data})` : ""}: ${d.cidade ?? "—"}${d.titulo ? " — " + d.titulo : ""}${d.hotel ? " · 🏨 " + d.hotel : ""}`;
      lines.push(head);
      for (const a of d.atividades ?? []) {
        const desc = [a.hora, a.titulo, a.tipo ? `[${a.tipo}]` : "", a.desc].filter(Boolean).join(" ");
        if (desc) lines.push(`  · ${desc}`);
      }
    }
  } else {
    lines.push("(Roteiro vazio.)");
  }
  return lines.join("\n");
}

// ────────────────────────── ERROR HANDLING ──────────────────────────

const FRIENDLY_ERROR = "O Jei está ocupado agora. Tenta de novo em alguns segundos! 😊";

async function withRetry(fn, label, attempts = 2, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      console.error(`[JEI/chat] ${label} tentativa ${i + 1}/${attempts} falhou:`, err?.message ?? err);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// ────────────────────────── PATH A: OPENAI (primary) ──────────────────────────

async function replyWithOpenAI({ system, history, userMessage }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");
  const input = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  return await withRetry(async () => {
    const client = new OpenAI({ apiKey });
    const result = await client.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input,
      max_output_tokens: 1024,
    });
    // Responses API expõe output_text (string agregada) ou output[].
    const text = result?.output_text
      ?? result?.output?.find?.((o) => o.type === "message")
        ?.content?.find?.((c) => c.type === "output_text")?.text
      ?? "";
    return text || FRIENDLY_ERROR;
  }, "openai-chat", 2, 1000);
}

// ────────────────────────── PATH B: GEMINI (fallback 1) ──────────────────────────

async function replyWithGemini({ system, history, userMessage }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente.");
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
  return await withRetry(async () => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: system,
      tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    });
    const result = await model.generateContent({ contents });
    const text = result?.response?.text?.() ?? "";
    return text || FRIENDLY_ERROR;
  }, "gemini-chat", 2, 1000);
}

// ────────────────────────── PATH C: ANTHROPIC (fallback 2) ──────────────────────────

async function replyWithAnthropic({ system, history, userMessage }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("[chat/anthropic] error", data);
    throw new Error(data?.error?.message ?? `Anthropic ${response.status}`);
  }
  return data.content?.[0]?.text ?? "Desculpe, não consegui responder agora.";
}

// ────────────────────────── HANDLER ──────────────────────────

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!hasOpenAI && !hasGemini && !hasAnthropic) {
    console.error("[JEI/chat] Nenhuma API key — devolvendo mensagem amigável.");
    return new Response(
      JSON.stringify({ reply: FRIENDLY_ERROR }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  console.log(
    hasOpenAI ? "[JEI/chat] Path primário: GPT-4o-mini"
    : hasGemini ? "[JEI/chat] Path primário: Gemini 2.5 Flash"
    : "[JEI/chat] Path primário: Claude Sonnet 4.5"
  );

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ reply: FRIENDLY_ERROR }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { message, history = [], trip = null, roteiro = [] } = body ?? {};
  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ reply: "Mensagem vazia." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const sanitizedHistory = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10);

  const system = SYSTEM_BASE + buildContext({ trip, roteiro });
  const params = { system, history: sanitizedHistory, userMessage: message };

  // Chain: OpenAI → Gemini → Claude. Cada path com retry interno; se um
  // falha após retries, cai pro próximo. Erro amigável só se TODOS falharem.
  const providers = [];
  if (hasOpenAI)    providers.push({ label: "OpenAI GPT-4o-mini", run: () => replyWithOpenAI(params) });
  if (hasGemini)    providers.push({ label: "Gemini 2.5 Flash",   run: () => replyWithGemini(params) });
  if (hasAnthropic) providers.push({ label: "Claude Sonnet 4.5",  run: () => replyWithAnthropic(params) });

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      if (i > 0) console.log(`[JEI/chat] Fallback: ${p.label}`);
      const reply = await p.run();
      return new Response(JSON.stringify({ reply }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(`[JEI/chat] ${p.label} falhou:`, err?.message ?? err);
    }
  }

  console.error("[JEI/chat] Todos os providers falharam.");
  return new Response(
    JSON.stringify({ reply: FRIENDLY_ERROR }),
    { status: 502, headers: { "Content-Type": "application/json" } }
  );
};

export const config = { path: "/api/chat" };
