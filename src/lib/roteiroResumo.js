// Monta um resumo textual do roteiro pra injetar no system prompt.
// `days` é o array vindo de useRoteiro (cada day tem .atividades já agregadas).

export function buildRoteiroResumo(days) {
  if (!Array.isArray(days) || days.length === 0) {
    return "Vazio — nenhum dia montado ainda.";
  }

  return days.map((dia) => {
    const head = `Dia ${dia.dia_numero}${dia.data ? ` (${dia.data})` : ""} — ${dia.titulo || dia.cidade || "?"}`;
    const lines = [head];
    if (dia.cidade && dia.titulo) lines.push(`  📍 ${dia.cidade}`);
    if (dia.hotel) lines.push(`  🏨 ${dia.hotel}${dia.hotel_endereco ? ` — ${dia.hotel_endereco}` : ""}`);
    if (dia.alerta) lines.push(`  ⚠️ ${dia.alerta}`);

    const ats = (dia.atividades ?? []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    if (ats.length === 0) {
      lines.push("  (sem atividades ainda)");
    } else {
      for (const a of ats) {
        const parts = [];
        parts.push(a.horario || "??:??");
        parts.push(`[ord=${a.ordem ?? "?"}]`);
        parts.push(a.titulo || "(sem título)");
        if (a.tipo) parts.push(`(${a.tipo})`);
        if (a.preco) parts.push(`— ${a.preco}`);
        lines.push("  · " + parts.join(" "));
      }
    }
    return lines.join("\n");
  }).join("\n\n");
}

export function buildWelcomeMessage(viagem) {
  const fmt = (iso) => {
    if (!iso) return null;
    const [, m, d] = iso.split("-");
    return d && m ? `${d}/${m}` : iso;
  };

  let out = "Oi! Sou o **Jei**, seu concierge de viagem 🧳\n\n";

  const facts = [];
  if (viagem?.cidades?.length) facts.push(`📍 ${viagem.cidades.join(", ")}`);
  const ini = fmt(viagem?.data_inicio);
  const fim = fmt(viagem?.data_fim);
  if (ini || fim) facts.push(`🗓️ ${ini ?? "?"} → ${fim ?? "?"}`);
  if (viagem?.num_pessoas) facts.push(`👥 ${viagem.num_pessoas} ${viagem.num_pessoas === 1 ? "pessoa" : "pessoas"}`);

  if (facts.length) {
    out += "Vi que vocês vão pra:\n" + facts.join(" · ") + "\n\n";
  }

  out += "Me conta como vocês querem viajar que eu cuido de tudo — ";
  if (!viagem?.cidades?.length) {
    out += "pesquiso o destino, hotéis, passeios e monto o roteiro pra vocês!";
  } else {
    out += "pesquiso hotéis, restaurantes, passeios e monto o roteiro pra vocês!";
  }
  return out;
}
