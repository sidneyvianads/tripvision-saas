// /api/plan — motor de planejamento conversacional do Viajjei.
//
// CHAIN DE PROVIDERS (tenta na ordem, cai pro próximo se falhar):
//   1. PRIMARY: OpenAI GPT-4o-mini via Responses API com tool
//      web_search_preview (web search nativo). Mais estável que Gemini,
//      segue instruções melhor, mais barato.
//   2. FALLBACK 1: Google Gemini 2.5 Flash com googleSearch grounding.
//   3. FALLBACK 2: Anthropic Claude Sonnet 4.5 com web_search_20250305.
//
// O frontend (PlanChat.jsx) lê SSE em formato Anthropic
// (data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}).
// Cada provider reembrulha os deltas nesse schema pra o front não mudar.
// Forward direto do upstream continua sendo o atalho do path Claude.

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
- ORGANIZADO: numera tudo, usa tabelas, facilita a escolha.

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

HOTEL — pesquise em Booking, Decolar, Airbnb. Avise: "🔍 Pesquisando em Booking, Decolar, Airbnb...". Mostre tabela:

| Hotel | ⭐ | Melhor preço | Plataforma |
|-------|---|--------------|------------|
| Nome 1 | 4.5 | R$350/n | Booking |
| Nome 2 | 4.2 | R$280/n | Decolar |
| Nome 3 | 4.7 | R$520/n | Airbnb |

💡 Melhor custo-benefício: **Nome 2 (R$280/n na Decolar)**

VOO — pesquise em Google Flights, Decolar, Kayak. Avise: "🔍 Pesquisando em Google Flights, Decolar, Kayak...". Mostre tabela:

| Cia | Rota | Duração | Melhor preço | Plataforma |
|-----|------|---------|--------------|------------|
| LATAM | REC→GRU→MCO | 14h | R$2.890 | Google Flights |
| GOL | REC→GIG→MCO | 16h | R$2.650 | Decolar |

💡 Melhor preço: **GOL na Decolar (R$2.650)**

Regras: indique sempre a plataforma; "—" pra célula sem dado (NUNCA invente); preço total em real INTEIRO ("R$890/3n"); negrito no melhor preço; mínimo 2 opções; aviso "⚠️ Preço de [data], confirme no site" pra dados antigos.

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

// ────────────────────────── PATH A: OPENAI (primary) ──────────────────────────
//
// Usa a Responses API com tool web_search_preview — grounding nativo do
// OpenAI, sem precisar gerenciar function calling manual. O stream emite
// eventos semânticos (response.output_text.delta) que reembrulhamos no
// schema SSE Anthropic que o front já lê.

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

// ────────────────────────── PATH B: GEMINI (fallback 1) ──────────────────────────

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

// ────────────────────────── PATH C: ANTHROPIC (fallback 2) ──────────────────────────

async function streamWithAnthropic({ system, history, userMessage }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente.");

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
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
  // Anthropic já emite SSE no formato que o front espera — forward direto.
  return upstream.body;
}

// ────────────────────────── HANDLER ──────────────────────────

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!hasOpenAI && !hasGemini && !hasAnthropic) {
    console.error("[JEI] Nenhuma API key configurada — devolvendo erro amigável.");
    return jsonResponse({ error: FRIENDLY_ERROR }, 503);
  }
  console.log(
    hasOpenAI ? "[JEI] Path primário: GPT-4o-mini"
    : hasGemini ? "[JEI] Path primário: Gemini 2.5 Flash"
    : "[JEI] Path primário: Claude Sonnet 4.5"
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
  // Chain: OpenAI → Gemini → Claude. Cada path tem retry interno; se um
  // path falha após retries, cai pro próximo. Só devolve erro amigável
  // quando TODOS falharem. Logs internos preservam detalhes pra debug.
  const userMessage = message.trim();
  const params = { system, history: sanitizedHistory, userMessage };

  // Lista ordenada de tentativas (só inclui os providers disponíveis)
  const providers = [];
  if (hasOpenAI)    providers.push({ label: "OpenAI GPT-4o-mini", run: () => streamWithOpenAI(params) });
  if (hasGemini)    providers.push({ label: "Gemini 2.5 Flash",   run: () => streamWithGemini(params) });
  if (hasAnthropic) providers.push({ label: "Claude Sonnet 4.5",  run: () => streamWithAnthropic(params) });

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
