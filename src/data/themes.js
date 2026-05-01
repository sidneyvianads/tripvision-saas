// Temas dinâmicos por viagem.
// Aplicados via CSS variables no container da viagem (TripLayout).

export const TEMAS = {
  cidade: {
    id: "cidade",
    label: "Cidade & Cultura",
    chip: "🌆 Cidade",
    emoji: "🏛️",
    gradient: "linear-gradient(135deg, #6366F1, #8B5CF6)",
    accent: "#A78BFA",
    accentDark: "#6366F1",
    bgLight: "#F0EEFF",
    cardBorder: "#6366F1",
    particles: "lights",
  },
  montanha: {
    id: "montanha",
    label: "Montanha & Frio",
    chip: "🏔️ Frio",
    emoji: "❄️",
    gradient: "linear-gradient(135deg, #1B4F72, #2E86C1)",
    accent: "#7CB9E8",
    accentDark: "#1B4F72",
    bgLight: "#E8F4FD",
    cardBorder: "#2E86C1",
    particles: "snow",
  },
  praia: {
    id: "praia",
    label: "Praia & Sol",
    chip: "🏖️ Praia",
    emoji: "☀️",
    gradient: "linear-gradient(135deg, #FF6B6B, #FF8E53)",
    accent: "#FF8E53",
    accentDark: "#E8483F",
    bgLight: "#FFF5F0",
    cardBorder: "#FF6B6B",
    particles: "waves",
  },
  natureza: {
    id: "natureza",
    label: "Natureza & Aventura",
    chip: "🌿 Natureza",
    emoji: "🌲",
    gradient: "linear-gradient(135deg, #059669, #10B981)",
    accent: "#34D399",
    accentDark: "#047857",
    bgLight: "#ECFDF5",
    cardBorder: "#059669",
    particles: "leaves",
  },
  internacional: {
    id: "internacional",
    label: "Internacional",
    chip: "🌍 Internacional",
    emoji: "✈️",
    gradient: "linear-gradient(135deg, #1F2937, #374151)",
    accent: "#9CA3AF",
    accentDark: "#1F2937",
    bgLight: "#F3F4F6",
    cardBorder: "#374151",
    particles: null,
  },
};

export const TEMA_KEYS = Object.keys(TEMAS);

export function getTema(id) {
  return TEMAS[id] ?? TEMAS.cidade;
}

// Mapeamento simples cidade → tema sugerido (item 57)
const CITY_HINTS = [
  // Frio / serra
  [/gramado|canela|cambori|urubici|bento gon|petr[oó]polis|campos do jord/i, "montanha"],
  // Praia
  [/recife|salvador|maceio|fortaleza|maragogi|porto de galinhas|jeri|natal|trancoso|noronha|ilhab|florian|balne|guaruj[aá]/i, "praia"],
  // Natureza
  [/lenç[oó]is|chapada|bonito|caminhos de pedra|pantanal|amaz[oô]/i, "natureza"],
  // Internacional
  [/paris|nova york|new york|londres|tokyo|t[oó]quio|nyc|orlando|miami|lisboa|porto|santiago|buenos|madri|roma/i, "internacional"],
];

export function suggestTemaByCidades(cidades) {
  if (!Array.isArray(cidades) || cidades.length === 0) return "cidade";
  const text = cidades.join(" ");
  for (const [re, id] of CITY_HINTS) {
    if (re.test(text)) return id;
  }
  return "cidade";
}

// Emoji baseado em cidade (item 57)
const CITY_EMOJIS = {
  "gramado": "🌲", "canela": "🌲", "campos do jordão": "🌲", "urubici": "🏔️",
  "rio de janeiro": "🏖️", "fortaleza": "🏖️", "salvador": "🌴", "florianópolis": "🏖️",
  "florianopolis": "🏖️", "natal": "🏖️", "maragogi": "🌴", "noronha": "🐢",
  "são paulo": "🌆", "sao paulo": "🌆", "brasília": "🏛️", "brasilia": "🏛️",
  "paris": "🗼", "londres": "🇬🇧", "nova york": "🗽", "new york": "🗽",
  "lisboa": "🇵🇹", "tokyo": "🗾", "tóquio": "🗾", "roma": "🇮🇹",
};

export function emojiForCidade(cidade) {
  if (!cidade) return null;
  return CITY_EMOJIS[cidade.toLowerCase().trim()] ?? null;
}
