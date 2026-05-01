// Planos comerciais do TripVision SaaS — fonte única da verdade
// Mudanças aqui se propagam pra Pricing, paywall, limites e webhooks.

export const PLANS = {
  free: {
    id: "free",
    nome: "Free",
    icon: "❄️",
    cor: "#7CB9E8",
    tagline: "Pra começar",
    features: [
      "1 viagem ativa",
      "Roteiro montado por formulário",
      "5 mensagens de IA (lifetime)",
      "Até 5 pessoas no grupo",
      "Checklist básico (5 itens)",
      "Suporte por comunidade",
    ],
    excluidos: ["Chat do grupo", "Painel admin", "IA ilimitada"],
  },
  pro: {
    id: "pro",
    nome: "Pro",
    icon: "✨",
    cor: "#D4A574",
    tagline: "Pro nosso uso real",
    badge: "MAIS POPULAR",
    features: [
      "5 viagens ativas",
      "IA conversacional ilimitada",
      "50 mensagens IA por dia",
      "Até 15 pessoas no grupo",
      "Chat do grupo realtime",
      "Painel admin (editar roteiro)",
      "Checklist ilimitado",
      "Suporte por email",
    ],
  },
  grupo: {
    id: "grupo",
    nome: "Grupo",
    icon: "⭐",
    cor: "#E8834A",
    tagline: "Pra grupos grandes",
    features: [
      "10 viagens ativas",
      "IA conversacional ilimitada",
      "100 mensagens IA por dia",
      "Até 30 pessoas no grupo",
      "Chat + admin + tudo do Pro",
      "Suporte prioritário",
    ],
  },
};

export const PRICES = {
  pro: {
    mensal: { amount: 14.9,  cycle: "mensal", display: "R$ 14,90/mês",  full: "R$ 14,90 por mês" },
    anual:  { amount: 119.9, cycle: "anual",  display: "R$ 119,90/ano", full: "R$ 119,90 por ano (economize 33%)" },
  },
  grupo: {
    mensal: { amount: 29.9,  cycle: "mensal", display: "R$ 29,90/mês",  full: "R$ 29,90 por mês" },
    anual:  { amount: 239.9, cycle: "anual",  display: "R$ 239,90/ano", full: "R$ 239,90 por ano (economize 33%)" },
  },
};

// Limites técnicos aplicados em runtime
export const LIMITS = {
  free:  { viagens: 1,  iaMsgsLifetime: 5,  iaMsgsDia: null, membros: 5,  checklist: 5,    chat: false, admin: false },
  pro:   { viagens: 5,  iaMsgsLifetime: null, iaMsgsDia: 50,  membros: 15, checklist: null, chat: true,  admin: true  },
  grupo: { viagens: 10, iaMsgsLifetime: null, iaMsgsDia: 100, membros: 30, checklist: null, chat: true,  admin: true  },
};

export function getLimits(plano) {
  return LIMITS[plano] ?? LIMITS.free;
}

export function planName(plano) {
  return PLANS[plano]?.nome ?? "Free";
}

export function planIcon(plano) {
  return PLANS[plano]?.icon ?? "❄️";
}

export function isPaid(plano) {
  return plano === "pro" || plano === "grupo";
}
