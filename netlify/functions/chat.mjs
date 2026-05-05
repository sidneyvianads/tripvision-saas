const SYSTEM_BASE = `Você é o Viajjei, concierge de viagem da família/grupo desta viagem específica.
Responda em português brasileiro, curto, direto, com emojis com moderação.
Use o contexto da viagem (cidades, datas, número de pessoas, roteiro já montado)
pra responder com precisão. Se a pergunta envolver pesquisa em tempo real
(preço atual, horário de funcionamento, status de voo), use as ferramentas
de busca disponíveis.

REGRAS:
- Quando pesquisar, traga PREÇO e ENDEREÇO se relevantes.
- Se faltar info da viagem, diga "ainda não tenho isso registrado".
- Não invente preços nem horários.`;

function buildContext({ trip, roteiro }) {
  if (!trip) return "";
  const lines = ["", "CONTEXTO DA VIAGEM:"];
  if (trip.nome) lines.push(`- Nome: ${trip.nome}`);
  if (trip.data_inicio || trip.data_fim) lines.push(`- Datas: ${trip.data_inicio ?? "?"} → ${trip.data_fim ?? "?"}`);
  if (trip.cidades?.length) lines.push(`- Cidades: ${trip.cidades.join(", ")}`);
  if (trip.num_pessoas) lines.push(`- Pessoas: ${trip.num_pessoas}`);
  if (trip.descricao) lines.push(`- Descrição: ${trip.descricao}`);
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
