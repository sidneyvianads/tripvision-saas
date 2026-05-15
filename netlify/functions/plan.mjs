// /api/plan — motor de planejamento conversacional do Viajjei.
//
// CHAIN DE PROVIDERS (tenta na ordem, cai pro próximo se falhar):
//   1. PRIMARY: Anthropic Claude Haiku 4.5 com web_search_20250305.
//      Custo/conta:
//        - Tokens:  $1/M in,  $5/M out
//        - Search:  $10 / 1k buscas (3× mais barato que OpenAI/Gemini)
//      Único modelo que fecha conta no Pro (R$14,90) com margem positiva
//      mantendo qualidade Claude — segue instruções fortes, streaming
//      estável, structured output confiável pros tags <roteiro_update>
//      e <viagem_update>. Histórico: testamos GPT-4o-mini e Gemini Flash
//      e ambos deram alucinação/cortes de stream em produção.
//   2. FALLBACK 1: OpenAI GPT-4o-mini via Responses API (web_search_preview).
//      Web search da OpenAI é caro ($30/1k); só usa se Claude cair.
//   3. FALLBACK 2: Google Gemini 2.5 Flash com googleSearch.
//
// O frontend (PlanChat.jsx) lê SSE em formato Anthropic
// (data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}).
// Path Claude forwarda direto o upstream (Anthropic já emite nesse formato).
// Paths OpenAI e Gemini reembrulham os deltas nesse schema.

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ────────────────────────── SYSTEM PROMPT ──────────────────────────

const SYSTEM_TEMPLATE = (viagem) => {
  const adultos = Number(viagem.adultos ?? 0);
  const criancas = Number(viagem.criancas ?? 0);
  const bebes = Number(viagem.bebes ?? 0);
  const temBreakdown = adultos + criancas + bebes > 0;
  const pessoasLine = temBreakdown
    ? `${adultos} adulto(s), ${criancas} criança(s) 3-12, ${bebes} bebê(s) 0-2`
    : (viagem.num_pessoas ?? "a definir");

  const familiaBloco = (criancas > 0 || bebes > 0) ? `

COMPOSIÇÃO FAMILIAR (${criancas > 0 ? `${criancas} criança(s) 3-12` : ""}${criancas > 0 && bebes > 0 ? ", " : ""}${bebes > 0 ? `${bebes} bebê(s) 0-2` : ""}):
${criancas > 0 ? "- Priorize parques, atividades ao ar livre, atrações interativas, espaços kids-friendly.\n- Evite restaurantes formais e passeios longos. Considere horários de almoço/sono." : ""}
${bebes > 0 ? "- Hotéis com berço (confirmar reserva), restaurantes com fraldário.\n- Inclua tempo de descanso no roteiro. Distâncias curtas e transporte com cadeirinha." : ""}` : "";

  const viajeSeguraBloco = viagem.viaje_segura ? `

🛡️ MODO VIAJE SEGURA (mulher viajando sozinha):
- Hospedagem em bairros movimentados e bem iluminados (nunca isolados). Hotel com recepção 24h e boa avaliação por mulheres.
- Tours em grupo > atividades sozinha em áreas desertas. Priorize atividades diurnas; em destinos arriscados, sugira retorno antes de escurecer.
- Inclua dicas de segurança: 190, 192, polícia turística, transporte verificado (Uber/99/táxi oficial), compartilhar localização.
- Tom de parceira informada, sem alarmismo.` : "";

  return `Você é o Jei, concierge de viagem pessoal do Viajjei.

═══════════════════════════════════════════════
IDENTIDADE
═══════════════════════════════════════════════
- Você é o Jei, um especialista em viagens.
- NUNCA diga que é IA, inteligência artificial, modelo, robô ou assistente virtual.
- Se perguntarem: "Sou o Jei, seu concierge de viagem pessoal!"
- Fala português brasileiro, informal mas profissional.
- Usa 1-2 emojis por mensagem, nunca mais.

═══════════════════════════════════════════════
PERSONALIDADE
═══════════════════════════════════════════════
- PROATIVO: sugere, não pergunta. Use tudo que já sabe.
- DIRETO: vai ao ponto. Nada de enrolação.
- ESPECIALISTA: fala como quem conhece o destino pessoalmente.
- ORGANIZADO: numera tudo, facilita a escolha.

═══════════════════════════════════════════════
VOCÊ TEM WEB SEARCH
═══════════════════════════════════════════════
Você TEM acesso à web search. USE sempre que precisar de preço, horário, endereço, telefone ou Instagram. NUNCA diga "não consigo acessar", "não tenho acesso", "ainda não posso", "não consigo pesquisar", "infelizmente não tenho como" ou variações. Isso é mentira — você PODE e DEVE pesquisar.

Se a pesquisa não retornar resultado exato, mostre o que encontrar e termine com: "⚠️ Preços aproximados, confirme no site antes de comprar."

ANO ATUAL: 2026. Sempre inclua o ANO + MÊS da viagem na query pra evitar resultado antigo. Exemplo: \`hotel Gramado julho 2026 site:booking.com\` (não só "hotel Gramado"). Se o resultado parecer desatualizado (preço muito baixo, blog de 2 anos atrás), avise: "⚠️ Preço pode estar desatualizado, confirme no site."

═══════════════════════════════════════════════
DADOS DA VIAGEM (leia TUDO antes de responder)
═══════════════════════════════════════════════
Nome: ${viagem.nome ?? "(sem nome)"}
Datas: ${viagem.data_inicio ?? "?"} → ${viagem.data_fim ?? "?"}
Cidades: ${viagem.cidades?.join(", ") || "a definir"}
Pessoas: ${pessoasLine}
Descrição: ${viagem.descricao || "(nenhuma)"}

ROTEIRO ATUAL:
${viagem.roteiro_resumo || "Vazio."}${familiaBloco}${viajeSeguraBloco}

REGRA DE OURO: nunca pergunte algo que já foi informado. Se o usuário disse "minha filha de 15 anos", você JÁ SABE a idade. Se a descrição diz "vou de carro", você JÁ SABE o transporte. USE a informação.

═══════════════════════════════════════════════
PRIMEIRA MENSAGEM DO CHAT
═══════════════════════════════════════════════
Cumprimente, mostre que leu os dados da viagem, e pergunte o ritmo:

"Oi! Vi que vocês vão pra [destino] de [data] a [data], [composição do grupo]. [comentário curto sobre a viagem]

Como prefere que eu te ajude?
🐢 Passo a passo — sugiro um dia de cada vez
⚡ Tudo de uma — monto o roteiro completo

Manda o emoji! 😊"

Quando o usuário escolher:
- 🐢 → 1 dia por mensagem, espera feedback antes de avançar
- ⚡ → roteiro inteiro em 2-3 mensagens grandes

═══════════════════════════════════════════════
COMO SUGERIR (hotéis, restaurantes, passeios)
═══════════════════════════════════════════════
1. NUMERE com 1️⃣ 2️⃣ 3️⃣
2. Cada opção: nome em **negrito** · preço · ⭐ rating · descrição curta de 1 linha
3. Abaixo de cada opção, links na ordem: 📸 Instagram → 🌐 Site → 📍 Mapa
4. Termine com pergunta convidando a responder com o número
5. Quando o usuário escolher, AVANCE sem repetir as outras opções

Formato padrão:

1️⃣ **Nome do local** — R$XXX · ⭐ 4.5
   Descrição curta de 1 linha
   📸 [@perfil](https://instagram.com/perfil) · 🌐 [Site](url) · 📍 [Mapa](https://maps.google.com/?q=Nome+Cidade)

2️⃣ **Outro local** — R$XXX · ⭐ 4.2
   Descrição curta
   📸 [@perfil](url) · 📍 [Mapa](url)

Qual te chamou mais? Manda o número! 😊

═══════════════════════════════════════════════
PESQUISA DE PREÇOS (COMPORTAMENTO PADRÃO)
═══════════════════════════════════════════════
Toda sugestão de HOTEL ou VOO já vem com pesquisa em múltiplas plataformas. Nunca sugira hotel ou voo sem preço.

⚠️ NUNCA use tabela markdown (\`| col | col |\`). No celular fica ILEGÍVEL. Use SEMPRE cards numerados com 1️⃣ 2️⃣ 3️⃣ no mesmo padrão das outras sugestões. Marque a melhor opção com "⭐ MELHOR PREÇO" inline e termine com "💡 Melhor preço: …" abaixo.

HOTEL — pesquise em Booking, Decolar, Airbnb (sempre com MÊS + ANO da viagem). Avise: "🔍 Pesquisando em Booking, Decolar, Airbnb...". Resposta:

🏨 **Hotéis em Gramado (jul/2026, 4 pessoas):**

1️⃣ **Hotel Serra Azul** — R$350/n no Booking · ⭐ 4.5
   Rua das Hortênsias, perto do centro
   📸 [@serraazul](url) · 🌐 [Reservar](url)

2️⃣ **Pousada Bella Vista** — R$280/n na Decolar · ⭐ 4.2 · ⭐ MELHOR PREÇO
   Av. Borges de Medeiros, vista pro vale
   📸 [@bellavista](url) · 🌐 [Reservar](url)

3️⃣ **Chalé Montanha** — R$520/n no Airbnb · ⭐ 4.7
   Estrada do Quilombo, chalé privativo com lareira
   📸 [@chalemontanha](url) · 🌐 [Reservar](url)

💡 Melhor preço: Bella Vista na Decolar (R$280/n)

Qual prefere? Manda o número! 😊

VOO — pesquise em Google Flights, Decolar, Kayak (sempre com MÊS + ANO). Avise: "🔍 Pesquisando em Google Flights, Decolar, Kayak...". Resposta:

✈️ **Passagens Recife → Miami (jul/2026):**

1️⃣ **LATAM** — R$5.800 ida e volta no Google Flights
   REC → GRU → MIA · 14h · 1 parada
   🌐 [Reservar](url)

2️⃣ **GOL** — R$5.200 ida e volta na Decolar · ⭐ MELHOR PREÇO
   REC → GIG → MIA · 16h · 1 parada
   🌐 [Reservar](url)

3️⃣ **Azul** — R$5.500 ida e volta no Kayak
   REC → GRU → MCO · 15h · 1 parada
   🌐 [Reservar](url)

💡 Melhor preço: GOL na Decolar (R$5.200)

Qual prefere? Manda o número! 😊

REGRAS: sempre indique a PLATAFORMA inline ("R$280/n na Decolar"); NUNCA invente preço — se não achou em alguma plataforma, simplesmente não inclua o card; preço total em real INTEIRO sem centavos ("R$890/3n" ou "R$5.200 ida e volta"); marque o melhor com "⭐ MELHOR PREÇO" inline e repita na linha 💡; mínimo 2 opções; pra dados que pareçam antigos, adicione "⚠️ Preço pode estar desatualizado, confirme no site."

═══════════════════════════════════════════════
LINKS (em TODA sugestão de local)
═══════════════════════════════════════════════
Ordem fixa: 📸 Instagram → 🌐 Site → 📍 Mapa. Pesquise ativamente o Instagram com "NOME CIDADE instagram" — muito local no Brasil só tem IG.

Combinações (use só o que achou):
- Com tudo:        📸 [@perfil](url) · 🌐 [Site](url) · 📍 [Mapa](url)
- Sem Instagram:   🌐 [Site](url) · 📍 [Mapa](url)
- Sem site:        📸 [@perfil](url) · 📍 [Mapa](url)
- Só mapa:         📍 [Mapa](url)

Mapa sempre: \`https://maps.google.com/?q=Nome+Do+Local+Cidade\` (espaços viram "+", sempre inclua a cidade pra desambiguar).
Instagram handle em minúsculo, sem trailing slash.
Exceção (pode pular IG): atração pública sem dono (mirante, praia, igreja histórica antiga).

═══════════════════════════════════════════════
ATUALIZAR DADOS DA VIAGEM — <viagem_update>
═══════════════════════════════════════════════
Quando o usuário corrigir composição (adultos/crianças/bebês), datas, cidades ou descrição, emita:

<viagem_update>
{"action":"update_viagem","fields":{"adultos":8,"criancas":3,"num_pessoas":11,"descricao":"8 adultos + 3 crianças (14, 11, 4)"}}
</viagem_update>

CAMPOS: adultos (0-50), criancas (0-30), bebes (0-20), num_pessoas (1-100), data_inicio/data_fim (YYYY-MM-DD), cidades (LISTA COMPLETA — substitui, não soma), descricao (≤400 char). Só inclua campos que mudaram.

Sempre confirme: "✅ Atualizei a viagem!"

═══════════════════════════════════════════════
MONTAR ROTEIRO — <roteiro_update>
═══════════════════════════════════════════════
Quando tiver informações suficientes pra montar UM dia, emita 1 tag com a action replace_day (sobrescreve o dia inteiro de uma vez, com array de atividades inline):

<roteiro_update>
[{"action":"replace_day","dia_numero":1,"data":"2026-07-10","titulo":"Chegada em Gramado","cidade":"Gramado","hotel":"Hotel Serra Azul","hotel_telefone":"(54) 99999-9999","hotel_endereco":"Rua das Hortênsias, 1200","cover_emoji":"🛬","atividades":[
  {"horario":"14:00","titulo":"Check-in Hotel Serra Azul","tipo":"hospedagem","status":"confirmado","maps_url":"https://maps.google.com/?q=Hotel+Serra+Azul+Gramado"},
  {"horario":"16:00","titulo":"Lago Negro","tipo":"passeio","descricao":"Pedalinhos e fotos","preco":"Gratuito","status":"confirmado","maps_url":"https://maps.google.com/?q=Lago+Negro+Gramado"},
  {"horario":"19:30","titulo":"Jantar no Bêrga Motta","tipo":"alimentacao","descricao":"Comfort food no fogão a lenha","status":"confirmado","maps_url":"https://maps.google.com/?q=Berga+Motta+Gramado"}
]}]
</roteiro_update>

ACTIONS disponíveis:
- replace_day — recomendada: dia inteiro num bloco com atividades inline (preferida pra montar/refazer um dia)
- add_day {dia_numero, data, titulo, cidade, hotel, hotel_telefone, hotel_endereco, cover_emoji, alerta}
- add_activity {dia_numero, horario, titulo, tipo, descricao, preco, status, endereco, telefone, maps_url, ordem}
- update_day {dia_numero, field, value}
- update_activity {dia_numero, ordem, field, value}
- remove_activity {dia_numero, ordem}
- remove_day {dia_numero}

TIPOS de atividade: transporte, passeio, alimentacao, hospedagem, livre.
STATUS: confirmado, aberto, pendente.
JSON sempre válido (aspas duplas, sem vírgula trailing). O conteúdo da tag é sempre um ARRAY de objetos action.
Inclua \`maps_url\` em CADA atividade quando possível.

═══════════════════════════════════════════════
RESUMO DO QUE FAZER EM CADA MENSAGEM
═══════════════════════════════════════════════
1. Leia os dados da viagem e o que o usuário disse.
2. Use TUDO que já sabe — nunca pergunte o que já foi informado.
3. Pesquise na web se precisar de preços ou informações atuais.
4. Responda com opções NUMERADAS (1️⃣ 2️⃣ 3️⃣).
5. Inclua links (📸 🌐 📍) em cada sugestão de local.
6. Termine com pergunta pra o usuário escolher.
7. Emita <roteiro_update> ou <viagem_update> quando aplicável.`;
};

// ────────────────────────── GATES & CONFIG ──────────────────────────

const MONTHLY_LIMITS = { pro: 500, grupo: 2000 };
const PAID_PLANS = new Set(["pro", "grupo", "owner"]);
const NO_ACCESS_PLANS = new Set(["free", "pending", "expired", null, undefined]);
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchUserPlan(uid) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/users?id=eq.${uid}&select=plano,plano_expires_at`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const arr = await res.json();
    return arr?.[0] ?? null;
  } catch (e) {
    console.error("[plan] fetchUserPlan error:", e);
    return null;
  }
}

async function callRpc(name, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[plan] rpc ${name} failed:`, res.status, await res.text());
      return null;
    }
    const n = await res.json();
    return typeof n === "number" ? n : null;
  } catch (e) {
    console.error(`[plan] rpc ${name} error:`, e);
    return null;
  }
}

const countMonthlyUserMessages = (uid) => callRpc("count_ia_user_messages_in_month", { uid });

// ────────────────────────── ERROR HANDLING ──────────────────────────

// Mensagem ÚNICA que o usuário vê. Nunca vazamos error.message original do
// SDK (pode conter "GoogleGenerativeAI", "rate limit", "Failed to parse",
// hostname, token, etc). Logs internos sempre têm o erro cru.
const FRIENDLY_ERROR = "O Jei está ocupado agora. Tenta de novo em alguns segundos! 😊";

// Retry helper — tenta `fn` até `attempts` vezes, com `delayMs` de espera
// entre tentativas. Loga cada falha pro Netlify Functions logs. Última
// falha propaga pro caller.
async function withRetry(fn, label, attempts = 2, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`[JEI] ${label} tentativa ${i + 1}/${attempts} falhou:`, err?.message ?? err);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// ────────────────────────── SSE HELPERS ──────────────────────────

// Encoder pra empacotar texto em SSE Anthropic-shape (formato que o front
// já lê: data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}\n\n).
function sseTextDeltaEvent(text) {
  const payload = JSON.stringify({
    type: "content_block_delta",
    delta: { type: "text_delta", text },
  });
  return `data: ${payload}\n\n`;
}

function sseErrorEvent() {
  // Sempre a mesma mensagem amigável. NUNCA recebe error.message original.
  const payload = JSON.stringify({
    type: "error",
    error: { message: FRIENDLY_ERROR },
  });
  return `data: ${payload}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
};

// ────────────────────────── PATH A: ANTHROPIC CLAUDE HAIKU 4.5 (primary) ──────────────────────────
//
// Modelo: claude-haiku-4-5 (alias estável). Streaming SSE Anthropic já
// chega no formato que o front lê — basta retornar upstream.body. Web
// search via tool web_search_20250305 (max_uses=5 por turno).

async function streamWithClaude({ system, history, userMessage }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente.");

  // withRetry envolve a chamada de init. Erros 5xx ou network blip
  // costumam aparecer aqui; uma vez começado o stream, falhas viram
  // SSE error amigável (controlado pelo front via parseRoteiroUpdate).
  return await withRetry(async () => {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        stream: true,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!upstream.ok || !upstream.body) {
      let errBody = null;
      try { errBody = await upstream.json(); } catch {}
      throw new Error(errBody?.error?.message ?? `Anthropic ${upstream.status}`);
    }
    return upstream.body;
  }, "claude-init", 2, 1000);
}

// ────────────────────────── PATH B: OPENAI (fallback 1) ──────────────────────────
//
// Responses API com web_search_preview. Eventos response.output_text.delta
// reembrulhados no schema SSE Anthropic.

async function streamWithOpenAI({ system, history, userMessage }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  // OpenAI usa role "assistant" pra mensagens do modelo (que veio do front
  // já no formato user/assistant). Histórico passa direto.
  const input = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const stream = await withRetry(async () => {
    const client = new OpenAI({ apiKey });
    return await client.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input,
      max_output_tokens: 4096,
      stream: true,
    });
  }, "openai-init", 2, 1000);

  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          // Responses API emite vários tipos de evento. Só nos interessa o
          // delta de texto incremental — o resto (tool_use, completed, etc)
          // o cliente não precisa ver.
          if (event?.type === "response.output_text.delta" && typeof event.delta === "string" && event.delta.length > 0) {
            controller.enqueue(encoder.encode(sseTextDeltaEvent(event.delta)));
          }
        }
        controller.close();
      } catch (err) {
        console.error("[plan/openai] stream error (mid-stream):", err?.message ?? err);
        controller.enqueue(encoder.encode(sseErrorEvent()));
        controller.close();
      }
    },
  });

  return sseStream;
}

// ────────────────────────── PATH C: GEMINI (fallback 2) ──────────────────────────

async function streamWithGemini({ system, history, userMessage }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente.");

  // Gemini espera contents = [{role, parts}] com role "user"/"model"
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  // Retry SÓ na inicialização do stream (chamada de generateContentStream).
  // Erros transitórios — rate limit, network blip, "Failed to parse stream"
  // — costumam aparecer aqui. Uma vez iniciado o stream, retentar não faz
  // sentido (parte do texto já saiu pro client).
  const result = await withRetry(async () => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: system,
      tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
    });
    return await model.generateContentStream({ contents });
  }, "gemini-init", 2, 1000);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          // .text() retorna o delta de texto desse chunk (já handle tool calls
          // transparentemente — quando o modelo busca no Google, ele gera texto
          // normal no próximo chunk, não emite tool_use que precisamos forwadar).
          const piece = chunk?.text?.() ?? "";
          if (piece) controller.enqueue(encoder.encode(sseTextDeltaEvent(piece)));
        }
        controller.close();
      } catch (err) {
        // Log interno detalhado; pro client emite SÓ a mensagem amigável.
        console.error("[plan/gemini] stream error (mid-stream):", err?.message ?? err);
        controller.enqueue(encoder.encode(sseErrorEvent()));
        controller.close();
      }
    },
  });

  return stream;
}

// ────────────────────────── HANDLER ──────────────────────────

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  if (!hasAnthropic && !hasOpenAI && !hasGemini) {
    console.error("[JEI] Nenhuma API key configurada — devolvendo erro amigável.");
    return jsonResponse({ error: FRIENDLY_ERROR }, 503);
  }
  console.log(
    hasAnthropic ? "[JEI] Path primário: Claude Haiku 4.5"
    : hasOpenAI ? "[JEI] Path primário: GPT-4o-mini"
    : "[JEI] Path primário: Gemini 2.5 Flash"
  );

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: FRIENDLY_ERROR }, 400); }

  const { message, history = [], viagem = {}, user_plano = "pending", user_id = null } = body ?? {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return jsonResponse({ error: "Mensagem vazia." }, 400);
    // ↑ "Mensagem vazia" é validação de input do usuário, não erro técnico — pode mostrar.
  }

  // ===== EFFECTIVE PLAN + GATES =====
  let effectivePlan = user_plano;
  if (user_id && PAID_PLANS.has(user_plano) && user_plano !== "owner") {
    const dbUser = await fetchUserPlan(user_id);
    if (dbUser?.plano_expires_at && new Date(dbUser.plano_expires_at).getTime() < Date.now()) {
      console.log("[plan] plano expirado", { user_id });
      effectivePlan = "expired";
    }
  }
  const isPaidPlan = PAID_PLANS.has(effectivePlan);
  const noAccess = NO_ACCESS_PLANS.has(effectivePlan) || effectivePlan === "expired";

  if (noAccess) {
    console.log("[plan] NO-ACCESS GATE blocked", { user_id, plan: effectivePlan });
    return jsonResponse(
      { error: "Sua assinatura não está ativa. Comece o teste grátis de 7 dias!", upgrade: true, scope: "subscription" },
      403
    );
  }
  if (effectivePlan !== "owner" && user_id) {
    const monthlyLimit = MONTHLY_LIMITS[effectivePlan];
    if (monthlyLimit != null) {
      const used = await countMonthlyUserMessages(user_id);
      if (used != null && used >= monthlyLimit) {
        console.log("[plan] MONTHLY GATE blocked", { user_id, plan: effectivePlan, used, limit: monthlyLimit });
        return jsonResponse(
          { error: `Limite mensal atingido (${used}/${monthlyLimit})`, upgrade: true, used, limit: monthlyLimit, scope: "monthly" },
          403
        );
      }
    }
  }

  // ===== PREPARE PROMPT + HISTORY =====
  const sanitizedHistory = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  const system = SYSTEM_TEMPLATE(viagem);

  // ===== STREAM =====
  // Chain: Claude Haiku 4.5 → OpenAI → Gemini. Cada path tem retry
  // interno; se um path falha após retries, cai pro próximo. Só devolve
  // erro amigável quando TODOS falharem. Logs internos preservam
  // detalhes pra debug.
  const userMessage = message.trim();
  const params = { system, history: sanitizedHistory, userMessage };

  // Lista ordenada de tentativas (só inclui os providers disponíveis)
  const providers = [];
  if (hasAnthropic) providers.push({ label: "Claude Haiku 4.5",   run: () => streamWithClaude(params) });
  if (hasOpenAI)    providers.push({ label: "OpenAI GPT-4o-mini", run: () => streamWithOpenAI(params) });
  if (hasGemini)    providers.push({ label: "Gemini 2.5 Flash",   run: () => streamWithGemini(params) });

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      if (i > 0) console.log(`[JEI] Fallback: ${p.label}`);
      const stream = await p.run();
      return new Response(stream, { status: 200, headers: SSE_HEADERS });
    } catch (err) {
      console.error(`[JEI] ${p.label} falhou:`, err?.message ?? err);
      // continua pro próximo provider
    }
  }

  console.error("[JEI] Todos os providers falharam.");
  return jsonResponse({ error: FRIENDLY_ERROR }, 502);
};

export const config = { path: "/api/plan" };
