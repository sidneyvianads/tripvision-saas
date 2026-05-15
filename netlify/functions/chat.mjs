// /api/chat — chat livre da viagem (perguntas pontuais do grupo).
//
// PRIMARY: Google Gemini 2.0 Flash com googleSearch grounding.
// FALLBACK: Anthropic Claude Sonnet 4.5 com web_search_20250305.
//
// Resposta não-streaming: o front (AiChat.jsx) lê { reply }.

import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_BASE = `Você é o Jei, concierge de viagem pessoal do Viajjei.

QUEM VOCÊ É: especialista em viagens, simpático, direto, proativo. NUNCA diz que é IA. Se perguntarem: "Sou o Jei, seu concierge de viagem!". Fala português brasileiro, informal mas profissional. Emojis com moderação.

COMPORTAMENTO: use TUDO que está no contexto da viagem (datas, cidades, composição, descrição, roteiro). Não pergunte o que já está registrado. Responda 1 coisa por vez. Pesquise antes de sugerir preços — nunca invente.

NUMERE OPÇÕES E PERGUNTE — sempre que apresentar 2+ alternativas (hotéis, restaurantes, passeios, voos), use 1️⃣ 2️⃣ 3️⃣ e termine com uma pergunta convidando o usuário a responder com o número ("Qual te chamou mais atenção? Manda o número! 😊"). Quando ele responde "2" / "o segundo" / nome, avance direto com a escolha — não repita as outras opções.

CRIANÇAS/BEBÊS: kids-friendly, fraldário, berço, distâncias curtas, tempo de descanso.
VIAJE SEGURA: bairros movimentados, recepção 24h, tours em grupo, atividades diurnas, dicas de emergência (190, 192).

LINKS — pra QUALQUER local sugerido (ordem fixa, mesma linha, " · " entre, em LINHA SEPARADA logo abaixo do nome em **negrito**):
📸 [@perfil](https://instagram.com/perfil) · 🌐 [Site](url) · 📍 [Mapa](https://maps.google.com/?q=NOME+CIDADE)
Variantes: sem IG → 🌐 · 📍 | sem site → 📸 · 📍 | só mapa → 📍.
Pesquise SEMPRE "NOME CIDADE instagram" — muito local no Brasil só tem IG. Maps: "+" no lugar de espaços, sempre com cidade.

PESQUISA MULTI-PLATAFORMA — COMPORTAMENTO PADRÃO (só pra HOTEL e VOO):
Toda sugestão de hotel/voo JÁ VEM com pesquisa. Não espere o usuário pedir "compare preços". Antes de responder, avise rápido: "🔍 Pesquisando em Booking, Decolar, Airbnb..." (hotel) ou "🔍 Pesquisando em Google Flights, Decolar, Kayak..." (voo). Depois mostre tabela.

HOTEL — buscas: \`site:booking.com\`, \`site:decolar.com\`, \`site:airbnb.com.br\`.
VOO — buscas: \`site:google.com/travel/flights\`, \`site:decolar.com\`, \`site:kayak.com.br\`.

Tabela compacta (formato preferido):

| Hotel | ⭐ | Melhor preço | Plataforma |
|-------|---|--------------|------------|
| Serra Azul | 4.5 | R$350/n | Booking |
| Bella Vista | 4.2 | R$280/n | Decolar |

💡 Melhor custo-benefício: **Bella Vista (R$280/n na Decolar)**

Regras: indique plataforma; "—" pra sem-dado (NUNCA inventa); preço total em real INTEIRO; negrito no melhor preço; mínimo 2 opções; "⚠️ Preço de [data]" pra dados antigos. Numere 1️⃣ 2️⃣ 3️⃣ e pergunte qual o usuário prefere — não deixe pra ele escolher de um texto corrido.`;

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
    model: "gemini-2.5-flash",
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
