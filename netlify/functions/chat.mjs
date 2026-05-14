const SYSTEM_BASE = `Você é o Viajjei, concierge de viagem da família/grupo desta viagem específica.
Responda em português brasileiro, curto, direto, com emojis com moderação.
Use o contexto da viagem (cidades, datas, composição da família, descrição e
roteiro já montado) pra responder com precisão. Se a pergunta envolver pesquisa
em tempo real (preço atual, horário de funcionamento, status de voo), use as
ferramentas de busca disponíveis.

REGRAS:
- LEIA a descrição da viagem e o roteiro antes de perguntar qualquer coisa. Se
  a info já estiver lá (transporte, preferências, hotel), NÃO pergunte de novo.
- Quando pesquisar, traga PREÇO e ENDEREÇO se relevantes.
- Se faltar info da viagem, diga "ainda não tenho isso registrado".
- Não invente preços nem horários.
- Se tiver crianças/bebês, prefira lugares kids-friendly e considere descanso.
- Se MODO VIAJE SEGURA estiver ativo, priorize segurança em todas as sugestões
  (bairros movimentados, tours em grupo, atividades diurnas, dicas de emergência).

LINKS — OBRIGATÓRIO em toda sugestão de local:
Sempre inclua, embaixo ou ao lado do nome em negrito:
- [📍 Ver no Maps](https://maps.google.com/?q=NOME+DO+LOCAL+CIDADE) — SEMPRE
- [🌐 Site](URL) — quando a busca retornar URL oficial confiável
- [🎟️ Reservar](URL) — quando for ingresso ou hotel com link de reserva
Encode: espaços viram "+", inclua a cidade no final pra desambiguar.
Exemplo: [📍 Ver no Maps](https://maps.google.com/?q=Restaurante+Bella+Vita+Gramado)
O usuário precisa CLICAR — não dê só o endereço em texto.`;

function buildContext({ trip, roteiro }) {
  if (!trip) return "";
  const lines = ["", "CONTEXTO DA VIAGEM:"];
  if (trip.nome) lines.push(`- Nome: ${trip.nome}`);
  if (trip.data_inicio || trip.data_fim) lines.push(`- Datas: ${trip.data_inicio ?? "?"} → ${trip.data_fim ?? "?"}`);
  if (trip.cidades?.length) lines.push(`- Cidades: ${trip.cidades.join(", ")}`);

  const adultos = Number(trip.adultos ?? 0);
  const criancas = Number(trip.criancas ?? 0);
  const bebes = Number(trip.bebes ?? 0);
  if (adultos + criancas + bebes > 0) {
    lines.push(`- Adultos: ${adultos}, Crianças (3-12): ${criancas}, Bebês (0-2): ${bebes}`);
  } else if (trip.num_pessoas) {
    lines.push(`- Pessoas: ${trip.num_pessoas}`);
  }

  if (trip.descricao) lines.push(`- Descrição: ${trip.descricao}`);

  if (trip.viaje_segura) {
    lines.push(
      "",
      "🛡️ MODO VIAJE SEGURA ATIVADO — mulher viajando sozinha. Adapte sugestões:",
      "  - Bairros seguros, movimentados, bem iluminados (nunca isolados).",
      "  - Hotéis com boa avaliação de mulheres, recepção 24h.",
      "  - Tours em grupo > atividades sozinha em áreas desertas.",
      "  - Atividades diurnas; em destinos arriscados, sugira retorno antes de escurecer.",
      "  - Inclua dicas de segurança: 190/192, transporte verificado, compartilhar localização.",
      "  - Tom: parceira informada, sem alarmismo."
    );
  }

  if (Array.isArray(roteiro) && roteiro.length > 0) {
    lines.push("", "ROTEIRO RESUMIDO:");
    for (const d of roteiro) {
      const head = `Dia ${d.dia}${d.data ? ` (${d.data})` : ""}: ${d.cidade ?? "—"}${d.titulo ? " — " + d.titulo : ""}${d.hotel ? " · 🏨 " + d.hotel : ""}`;
      lines.push(head);
      for (const a of d.atividades ?? []) {
        const desc = [a.hora, a.titulo, a.tipo ? `[${a.tipo}]` : "", a.desc].filter(Boolean).join(" ");
        if (desc) lines.push(`  · ${desc}`);
      }
    }
  } else {
    lines.push("(O roteiro ainda não tem dias definidos.)");
  }
  return lines.join("\n");
}

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

  const { message, history = [], trip = null, roteiro = [] } = body ?? {};
  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ reply: "Mensagem vazia." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const sanitizedHistory = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10);

  const SYSTEM = SYSTEM_BASE + buildContext({ trip, roteiro });

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
        max_tokens: 1024,
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          ...sanitizedHistory,
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[chat] anthropic error", data);
      return new Response(
        JSON.stringify({ reply: data?.error?.message ?? "O Jei está com dificuldade. Tente de novo." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    const reply = data.content?.[0]?.text ?? "Desculpe, não consegui responder agora.";
    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[chat] fetch failed", err);
    return new Response(
      JSON.stringify({ reply: "O Jei está fora do ar agora. Tente de novo." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/chat" };
