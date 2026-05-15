// /api/chat — chat livre da viagem (perguntas pontuais do grupo).
//
// PRIMARY: Google Gemini 2.0 Flash com googleSearch grounding.
// FALLBACK: Anthropic Claude Sonnet 4.5 com web_search_20250305.
//
// Resposta não-streaming: o front (AiChat.jsx) lê { reply }.

import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_BASE = `Você é o Jei, concierge de viagem do Viajjei. Responda em português, curto, direto, com emojis com moderação. Use o contexto da viagem (cidades, datas, composição, descrição, roteiro) pra responder com precisão. Pra preço/horário/status em tempo real, pesquise.

REGRAS:
- LEIA descrição e roteiro antes de perguntar qualquer coisa. Não pergunte o que já está registrado.
- Pesquise → traga preço e endereço. Se faltar info, diga "ainda não tenho isso registrado". Nunca invente.
- Crianças/bebês → kids-friendly, descanso. Viaje Segura → bairros movimentados, tours em grupo, dicas de emergência.

LINKS (em toda sugestão de local — até 3, mesma linha, " · " entre):
1) [📍 Ver no Maps](https://maps.google.com/?q=NOME+CIDADE) — SEMPRE
2) [🌐 Site](URL) — se achar
3) [📸 @handle](https://instagram.com/handle) — se achar
Muito local só tem IG — se não achar site, BUSQUE o IG. Maps: "+" no lugar de espaços, inclua cidade.

PESQUISA MULTI-PLATAFORMA (só pra HOTEL ou VOO — não pra restaurante/passeio):

Hotel — \`site:booking.com\`, \`site:decolar.com\`, \`site:airbnb.com.br\` (+ trivago.com.br, hoteis.com se sobrar).
Voo — \`site:google.com/travel/flights\`, \`site:decolar.com\`, \`site:kayak.com.br\`.

Tabela markdown:

🏨 **Hotéis em [DESTINO]** ([DATAS]):

| Hotel | ⭐ | Booking | Decolar | Airbnb |
|-------|---|---------|---------|--------|
| X | 4.5 | R$890/3n | R$920/3n | — |
| Y | 4.3 | — | — | R$780/3n |

💡 **Melhor preço:** Y no Airbnb (R$260/noite)

Regras: indique plataforma; "—" pra sem-dado (não inventa); total em real INTEIRO ("R$890/3n"); negrito no melhor preço; mínimo 2 opções; "⚠️ Preço de [data]" pra dados antigos.`;

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

// ────────────────────────── PATH A: GEMINI ──────────────────────────

async function replyWithGemini({ system, history, userMessage }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: system,
    tools: [{ googleSearch: {} }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  });
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
  const result = await model.generateContent({ contents });
  const text = result?.response?.text?.() ?? "";
  return text || "Desculpe, não consegui responder agora.";
}

// ────────────────────────── PATH B: ANTHROPIC (fallback) ──────────────────────────

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

  const useGemini = !!process.env.GEMINI_API_KEY;
  const useAnthropic = !useGemini && !!process.env.ANTHROPIC_API_KEY;
  if (!useGemini && !useAnthropic) {
    return new Response(
      JSON.stringify({ reply: "⚠️ Nem GEMINI_API_KEY nem ANTHROPIC_API_KEY configuradas." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  console.log(useGemini ? "[JEI/chat] Usando Gemini 2.0 Flash" : "[JEI/chat] Fallback: Claude Sonnet 4.5");

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ reply: "Requisição inválida." }), {
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

  try {
    const reply = useGemini
      ? await replyWithGemini({ system, history: sanitizedHistory, userMessage: message })
      : await replyWithAnthropic({ system, history: sanitizedHistory, userMessage: message });
    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[chat] failed:", err);
    return new Response(
      JSON.stringify({ reply: "O Jei está fora do ar agora. Tente de novo." }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/chat" };
