// Planos comerciais do TripVision SaaS — fonte única da verdade
// Mudanças aqui se propagam pra Pricing, paywall, limites e webhooks.

export const PLANS = {
  free: {
    id: "free",
    nome: "Free",
    icon: "🧳",
    cor: "#6366F1",
    tagline: "Pra experimentar",
    features: [
      "1 viagem",
      "5 mensagens de IA (no total)",
      "Editar roteiro manualmente",
      "Checklist básico (5 itens)",
    ],
    excluidos: [
      "Compartilhar com o grupo",
      "Chat do grupo",
      "Pesquisa online da IA",
    ],
  },
  pro: {
    id: "pro",
    nome: "Pro",
    icon: "✨",
    cor: "#8B5CF6",
    tagline: "Pra viajar de verdade",
    badge: "MAIS POPULAR",
    features: [
      "Até 3 viagens",
      "IA com pesquisa online (preços reais)",
      "50 mensagens IA por dia",
      "Compartilhar com até 5 pessoas",
      "Chat do grupo realtime",
      "Checklist ilimitado",
      "Editar roteiro completo",
    ],
  },
};

export const PRICES = {
  pro: {
    mensal: { amount: 14.9,  cycle: "mensal", display: "R$ 14,90/mês",  full: "R$ 14,90 por mês" },
    anual:  { amount: 119.9, cycle: "anual",  display: "R$ 119,90/ano", full: "R$ 119,90 por ano (economize 33%)" },
  },
};

// Limites técnicos aplicados em runtime
export const LIMITS = {
  free: {
    viagens: 1,
    iaMsgsLifetime: 5,
    iaMsgsDia: null,
    membros: 1,         // só o dono — não compartilha
    checklist: 5,
    chat: false,
    admin: true,        // free pode editar manualmente o próprio roteiro
    pesquisa: false,    // sem web_search
    compartilhar: false,
  },
  pro: {
    viagens: 3,
    iaMsgsLifetime: null,
    iaMsgsDia: 50,
    membros: 5,
    checklist: null,
    chat: true,
    admin: true,
    pesquisa: true,
    compartilhar: true,
  },
};

export function getLimits(plano) {
  return LIMITS[plano] ?? LIMITS.free;
}

export function planName(plano) {
  return PLANS[plano]?.nome ?? "Free";
}

export function planIcon(plano) {
  return PLANS[plano]?.icon ?? "🧳";
}

export function isPaid(plano) {
  return plano === "pro";
}
