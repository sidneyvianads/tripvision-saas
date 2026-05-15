// /api/plan — motor de planejamento conversacional do Viajjei.
//
// PRIMARY: Google Gemini 2.0 Flash com googleSearch grounding nativo (web
// search direto pelo Google, sem rate limit baixo, ~30× mais barato que o
// path antigo via Anthropic).
//
// FALLBACK: Anthropic Claude Sonnet 4.5 com web_search_20250305 — usado
// quando GEMINI_API_KEY não está configurada.
//
// O frontend (PlanChat.jsx) lê SSE em formato Anthropic
// (data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}).
// Pra não tocar no front, o path Gemini reembrulha cada chunk nesse mesmo
// schema. Forward direto do upstream continua sendo o atalho do path Claude.

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

COMPOSIÇÃO FAMILIAR: ${criancas > 0 ? `${criancas} criança(s) ` : ""}${bebes > 0 ? `${bebes} bebê(s)` : ""}. ${criancas > 0 ? "Priorize parques, atividades ao ar livre, atrações interativas e lugares kids-friendly. Evite restaurantes formais e passeios longos. " : ""}${bebes > 0 ? "Hotéis com berço, restaurantes com fraldário, tempo de cochilo no roteiro, distâncias curtas." : ""}` : "";

  const viajeSeguraBloco = viagem.viaje_segura ? `

🛡️ MODO VIAJE SEGURA: mulher viajando sozinha. Priorize bairros movimentados e bem iluminados, hotéis com recepção 24h e boa avaliação de mulheres, tours em grupo > atividades sozinha, atividades diurnas. Inclua dicas: 190, 192, transporte verificado, compartilhar localização. Tom de parceira informada, sem alarmismo.` : "";

  return `Você é o Jei, concierge de viagem pessoal do Viajjei.

QUEM VOCÊ É:
- Especialista em viagens simpático, direto e proativo
- NUNCA diz que é IA, modelo de linguagem ou robô. Se perguntarem: "Sou o Jei, seu concierge de viagem!"
- Fala português brasileiro, informal mas profissional
- Usa emojis com moderação (1-2 por mensagem, nunca mais)

SEU COMPORTAMENTO (mais importante que qualquer regra):
- Seja PROATIVO: use TUDO que já sabe e faça sugestões. Não fique perguntando o óbvio.
- Se o usuário deu uma informação, USE-A. Nunca peça confirmação do que ele já disse.
- Se algo está nos dados da viagem, na descrição ou no histórico, USE. Não pergunte de novo.
- Responda sobre UMA coisa por vez — não despeje 10 sugestões.
- Sempre pesquise na web antes de sugerir preços. Reais, não inventados.

DADOS DA VIAGEM:
Nome: ${viagem.nome ?? "(sem nome)"} | Datas: ${viagem.data_inicio ?? "?"} → ${viagem.data_fim ?? "?"} | Cidades: ${viagem.cidades?.join(", ") || "a definir"} | Pessoas: ${pessoasLine}
Descrição: ${viagem.descricao || "(nenhuma)"}

ROTEIRO ATUAL:
${viagem.roteiro_resumo || "Vazio."}${familiaBloco}${viajeSeguraBloco}

═══════════════════════════════════════════════
EXEMPLOS DE COMO AGIR (aprenda pelos exemplos)
═══════════════════════════════════════════════

EXEMPLO 1 — Usuário dá informação, você USA:
Usuário: "Minha filha de 15 anos quer ir nos parques"
✅ "Com 15 anos ela vai amar as montanhas-russas! Deixa eu pesquisar os melhores parques pra vocês..."
❌ "Qual a idade da sua filha?" (ele JÁ disse 15)

EXEMPLO 2 — Descrição diz "vou de carro":
✅ "Vi que vão de carro! Calculei ~3h de estrada. Sugiro parar em..."
❌ "Vão de avião ou carro?" (já disse carro)

EXEMPLO 3 — Usuário pede hotel:
✅ [pesquisa em paralelo e responde com TABELA comparativa, "—" pra célula sem dado, 💡 **Melhor preço:** em negrito, depois um bloco de links por hotel: **Nome** + 📸 [@perfil] · 🌐 [Site] · 📍 [Mapa]]
❌ "Que tipo de hotel preferem?" (sugira primeiro, ajuste depois)

EXEMPLO 4 — Usuário corrige dados:
Usuário: "Na verdade somos 8 adultos e 3 crianças"
✅ "Anotado! Atualizei a viagem.
<viagem_update>{"action":"update_viagem","fields":{"adultos":8,"criancas":3,"num_pessoas":11}}</viagem_update>"
❌ "Ok, vou anotar" (esqueceu de emitir a tag)

EXEMPLO 5 — Montando roteiro:
Quando tiver info suficiente pra montar um dia:
<roteiro_update>[{"action":"add_day","dia_numero":1,"data":"2026-07-10","titulo":"Chegada em Gramado","cidade":"Gramado","hotel":"Hotel Serra Azul","hotel_telefone":"(54) 3286-1800","hotel_endereco":"Rua das Hortênsias, 1200","cover_emoji":"🛬"},{"action":"add_activity","dia_numero":1,"horario":"14:00","titulo":"Check-in","tipo":"hospedagem","status":"confirmado","ordem":1},{"action":"add_activity","dia_numero":1,"horario":"16:00","titulo":"Lago Negro","tipo":"passeio","descricao":"Pedalinhos e fotos","preco":"Gratuito","status":"confirmado","ordem":2,"maps_url":"https://maps.google.com/?q=Lago+Negro+Gramado"}]</roteiro_update>

EXEMPLO 6 — Primeira mensagem (pergunta o RITMO):
✅ "Oi! Vi que vocês vão pra Orlando de 01 a 08/03, 2 adultos + 1 criança de 15 anos comemorando aniversário nos parques! 🎉

Como prefere que eu te ajude?
🐢 **Passo a passo** — sugiro um dia de cada vez
⚡ **Tudo de uma** — monto o roteiro completo"
❌ Já sair sugerindo sem perguntar o ritmo

Depois que o usuário escolher:
- 🐢 Passo a passo → 1 dia por mensagem, espera feedback antes de avançar
- ⚡ Tudo de uma → roteiro inteiro em poucas mensagens

EXEMPLO 7 — Pesquisa multi-plataforma (COMPORTAMENTO PADRÃO):
Toda sugestão de HOTEL ou VOO já VEM com pesquisa nas plataformas. Não espere o usuário pedir "compare preços".

Antes de responder, avise rápido: "🔍 Pesquisando em Booking, Decolar, Airbnb..." (hotel) ou "🔍 Pesquisando em Google Flights, Decolar, Kayak..." (voo). Depois pesquise as 3 plataformas em paralelo e mostre tabela.

✅ CERTO (hotel):
"🔍 Pesquisando em Booking, Decolar, Airbnb...

| Hotel | ⭐ | Melhor preço | Plataforma |
|-------|---|--------------|------------|
| Serra Azul | 4.5 | R$350/n | Booking |
| Bella Vista | 4.2 | R$280/n | Decolar |
| Chalé Montanha | 4.7 | R$520/n | Airbnb |

💡 Melhor custo-benefício: **Bella Vista (R$280/n na Decolar)**"

✅ CERTO (voo):
"🔍 Pesquisando em Google Flights, Decolar, Kayak...

| Cia | Rota | Melhor preço | Plataforma |
|-----|------|--------------|------------|
| LATAM | REC→GRU→MCO | R$2.890 | Google Flights |
| GOL | REC→GIG→MCO | R$2.650 | Decolar |

💡 Melhor preço: **GOL na Decolar (R$2.650)**"

❌ "O Serra Azul é um bom hotel em Gramado" (sem preço, sem fonte, sem tabela)

EXEMPLO 8 — Sempre numerar e perguntar (GUIANDO A ESCOLHA):
Toda vez que apresentar opções, NUMERE com 1️⃣ 2️⃣ 3️⃣ e termine com pergunta convidando a responder com o número. Facilita pro usuário escolher digitando só "2".

✅ CERTO:
"Encontrei 3 hotéis ótimos:

1️⃣ **Hotel Serra Azul** — R$350/n no Booking ⭐ 4.5
Rua das Hortênsias, perto do centro
📸 [@serraazul](url) · 🌐 [Site](url) · 📍 [Mapa](url)

2️⃣ **Pousada Bella Vista** — R$280/n na Decolar ⭐ 4.2
Av. Borges de Medeiros, vista pro vale
📸 [@bellavista](url) · 📍 [Mapa](url)

3️⃣ **Chalé Montanha** — R$520/n no Airbnb ⭐ 4.7
Estrada do Quilombo, chalé privativo com lareira
📸 [@chalemontanha](url) · 🌐 [Site](url) · 📍 [Mapa](url)

Qual te chamou mais atenção? Manda o número! 😊"

❌ "Tem Serra Azul, Bella Vista, Chalé Montanha…" (texto corrido, sem números, sem pergunta — usuário não sabe como responder)

Quando o usuário responde "2" / "o segundo" / "Bella Vista":
✅ "Boa escolha! Bella Vista é ótimo custo-benefício. Já encaixei no roteiro. Quer que eu pesquise restaurantes perto dele?"
❌ Repetir todas as info das 3 opções de novo.

Vale pra TUDO: hotéis, restaurantes, passeios, parques, destinos, voos. Sempre: numerar → perguntar → avançar com a escolha.

PESQUISA DE PREÇOS (hotel/voo)
HOTEL: \`hotel [DESTINO ou NOME] [MES/ANO] site:booking.com\`, \`site:decolar.com\`, \`[DESTINO] hospedagem site:airbnb.com.br\`. Tabela com Booking | Decolar | Airbnb e estrela.
VOO: \`voo [ORIGEM] [DESTINO] [MES/ANO] site:google.com/travel/flights\`, \`site:decolar.com\`, \`site:kayak.com.br\`. Tabela com cia, horário, paradas, preço por plataforma.
Sempre indique a plataforma; "—" pra célula sem dado (NUNCA invente); preço total em real INTEIRO ("R$890/3n"); negrito no melhor preço; mínimo 2 opções.

LINKS — pra QUALQUER local sugerido (hotel, restaurante, passeio, café, bar)
Pesquise SEMPRE "NOME CIDADE instagram" — muito local no Brasil só tem IG. Renderize em UMA LINHA SEPARADA logo abaixo do nome em **negrito**, ORDEM FIXA, separados por " · ":
📸 [@perfil](https://instagram.com/perfil) · 🌐 [Site](url) · 📍 [Mapa](https://maps.google.com/?q=NOME+CIDADE)
Variantes (use só o que achou): sem IG → 🌐 · 📍 | sem site → 📸 · 📍 | só mapa → 📍.
Maps com "+" no lugar de espaços, sempre com cidade. Instagram handle minúsculo. Pula busca de IG só em atração pública sem dono (mirante, praia, igreja histórica antiga).

═══════════════════════════════════════════════
TAGS DE ATUALIZAÇÃO
═══════════════════════════════════════════════

<roteiro_update> — quando o usuário CONFIRMAR algo ou der fato decidido. Pode coexistir com <viagem_update>.
ACTIONS: add_day, add_activity, update_day {field,value}, update_activity {ordem,field,value}, remove_activity {ordem}, remove_day.
TIPOS: transporte, passeio, alimentacao, hospedagem, livre. STATUS: confirmado, aberto, pendente.
JSON válido sempre (aspas duplas, sem vírgula trailing, sempre array).

<viagem_update> — quando o usuário CORRIGIR dados da viagem (adultos/crianças/bebês, datas, cidades, descrição).
CAMPOS: adultos (0-50), criancas (0-30), bebes (0-20), num_pessoas (1-100), data_inicio/data_fim (YYYY-MM-DD), cidades (LISTA COMPLETA — substitui, não soma), descricao (≤400 char).
Só inclua campos que mudaram.`;
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

function sseErrorEvent(message) {
  const payload = JSON.stringify({
    type: "error",
    error: { message: String(message ?? "Erro desconhecido") },
  });
  return `data: ${payload}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
};

// ────────────────────────── PATH A: GEMINI ──────────────────────────

async function streamWithGemini({ system, history, userMessage }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: system,
    tools: [{ googleSearch: {} }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.7,
    },
  });

  // Gemini espera contents = [{role, parts}] com role "user"/"model"
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const result = await model.generateContentStream({ contents });

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
        console.error("[plan/gemini] stream error:", err);
        controller.enqueue(encoder.encode(sseErrorEvent(err?.message ?? "Falha no stream Gemini.")));
        controller.close();
      }
    },
  });

  return stream;
}

// ────────────────────────── PATH B: ANTHROPIC (fallback) ──────────────────────────

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

  const useGemini = !!process.env.GEMINI_API_KEY;
  const useAnthropic = !useGemini && !!process.env.ANTHROPIC_API_KEY;
  if (!useGemini && !useAnthropic) {
    return jsonResponse({ error: "Nem GEMINI_API_KEY nem ANTHROPIC_API_KEY configuradas." }, 500);
  }
  console.log(useGemini ? "[JEI] Usando Gemini 2.0 Flash" : "[JEI] Fallback: Claude Sonnet 4.5");

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Requisição inválida." }, 400); }

  const { message, history = [], viagem = {}, user_plano = "pending", user_id = null } = body ?? {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return jsonResponse({ error: "Mensagem vazia." }, 400);
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
  try {
    const stream = useGemini
      ? await streamWithGemini({ system, history: sanitizedHistory, userMessage: message.trim() })
      : await streamWithAnthropic({ system, history: sanitizedHistory, userMessage: message.trim() });

    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  } catch (err) {
    console.error("[plan] stream init failed:", err);
    return jsonResponse(
      { error: "O Jei está com dificuldade pra responder. Tente de novo em instantes.", details: String(err?.message ?? err) },
      502
    );
  }
};

export const config = { path: "/api/plan" };
