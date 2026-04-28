// /api/plan — motor de planejamento conversacional do TripVision
// Usa Claude Sonnet 4.5 + web_search_20250305 (server-side tool da Anthropic).
// O tool é executado automaticamente pelo backend da Anthropic; o cliente
// só precisa enviar a definição e ler a resposta final em texto.

const SYSTEM_TEMPLATE = (viagem) => `Você é o TripVision, um planejador de viagens inteligente, simpático e criterioso.

DADOS DA VIAGEM:
- Nome: ${viagem.nome ?? "(sem nome)"}
- Datas: ${viagem.data_inicio ?? "?"} a ${viagem.data_fim ?? "?"}
- Cidades: ${viagem.cidades?.length ? viagem.cidades.join(", ") : "a definir"}
- Pessoas: ${viagem.num_pessoas ?? "a definir"}
- Descrição: ${viagem.descricao || "nenhuma"}

ROTEIRO ATUAL:
${viagem.roteiro_resumo || "Vazio — nenhum dia montado ainda."}

SEU OBJETIVO:
Ajudar o usuário a montar o roteiro completo conversando naturalmente.

COMO AGIR:
1. ENTENDER: pergunte sobre preferências, orçamento, estilo (aventura, relax, cultura, gastronomia)
2. PESQUISAR: use web search pra encontrar restaurantes, hotéis, passeios COM preço e endereço atualizados
3. SUGERIR: apresente 2-3 opções, deixe o usuário escolher
4. MONTAR: a cada decisão CONFIRMADA, encaixe no roteiro com horário, endereço e observações
5. ALERTAR: horários de funcionamento, distâncias, clima, documentos, reservas

REGRAS:
- Responda em português brasileiro
- Use emojis com moderação (não exagere)
- Seja direto e prático — pergunte UMA coisa por vez
- Quando pesquisar, SEMPRE traga preço estimado e endereço
- NÃO invente preços — se não encontrar, diga "não encontrei o preço atualizado, vale confirmar"
- A cada bloco de decisões, resuma o que ficou definido

FORMATO DE SAÍDA:
Responda sempre com texto natural pro usuário.
Quando o usuário CONFIRMAR uma decisão (não apenas pedir sugestão), adicione no FINAL da mensagem um bloco JSON entre tags <roteiro_update> e </roteiro_update> com as ações:

<roteiro_update>
[
  {
    "action": "add_day",
    "dia_numero": 1,
    "data": "2026-07-10",
    "titulo": "Chegada em Gramado",
    "cidade": "Gramado",
    "hotel": "Hotel Laghetto Stilo Centro",
    "hotel_telefone": "(54) 3286-1800",
    "hotel_endereco": "Rua Madre Verônica, 27",
    "alerta": null,
    "cover_emoji": "🛬"
  },
  {
    "action": "add_activity",
    "dia_numero": 1,
    "horario": "14:00",
    "titulo": "Check-in no hotel",
    "tipo": "hospedagem",
    "descricao": "Rua Madre Verônica, 27, Centro",
    "preco": null,
    "status": "confirmado",
    "endereco": "Rua Madre Verônica, 27",
    "ordem": 1
  }
]
</roteiro_update>

ACTIONS POSSÍVEIS:
- add_day: cria dia novo (campos: dia_numero, data, titulo, cidade, hotel, hotel_telefone, hotel_endereco, alerta, cover_emoji)
- add_activity: adiciona atividade (campos: dia_numero, horario, titulo, tipo, descricao, preco, status, endereco, telefone, maps_url, ordem)
- update_day: atualiza um campo de um dia (campos: dia_numero, field, value)
- update_activity: atualiza atividade (campos: dia_numero, ordem, field, value)
- remove_activity: remove atividade (campos: dia_numero, ordem)
- remove_day: remove dia inteiro (campos: dia_numero)

TIPOS DE ATIVIDADE: transporte, passeio, alimentacao, hospedagem, livre
STATUS: confirmado, aberto, pendente

REGRAS DO UPDATE:
- Só gere <roteiro_update> quando o usuário CONFIRMAR. Se está só sugerindo, NÃO gere.
- "vamos com a opção 2" → gere o update.
- "o que sugere pra almoço?" → NÃO gere update — apenas sugira.
- Após gerar o update, confirme em texto: "Adicionei ao roteiro: [resumo]"
- Use ordem incrementando dentro do mesmo dia (1, 2, 3…) com base no roteiro atual.
`;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ reply: "⚠️ ANTHROPIC_API_KEY não configurada no Netlify." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ reply: "Requisição inválida." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { message, history = [], viagem = {} } = body ?? {};
  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ reply: "Mensagem vazia." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const sanitizedHistory = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  const SYSTEM = SYSTEM_TEMPLATE(viagem);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5,
          },
        ],
        messages: [
          ...sanitizedHistory,
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[plan] anthropic error:", data);
      return new Response(
        JSON.stringify({ reply: data?.error?.message ?? "Erro ao chamar a IA." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // O modelo retorna content blocks; web_search é executado server-side
    // pela Anthropic e os resultados ficam inlined. Pegamos só os blocos de texto.
    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const usage = data.usage || {};

    return new Response(
      JSON.stringify({
        reply: textBlocks,
        stop_reason: data.stop_reason,
        usage: {
          input: usage.input_tokens,
          output: usage.output_tokens,
          cache_read: usage.cache_read_input_tokens,
          cache_creation: usage.cache_creation_input_tokens,
          web_searches: usage.server_tool_use?.web_search_requests,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[plan] fetch failed:", err);
    return new Response(
      JSON.stringify({ reply: "Erro ao conectar com a IA. Tente novamente." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/plan" };
