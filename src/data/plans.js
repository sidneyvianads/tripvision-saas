// Planos comerciais do Viajjei SaaS — fonte única da verdade
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
      "5 mensagens de IA por dia",
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
      "500 mensagens IA por mês",
      "Compartilhar com até 5 pessoas",
      "Chat do grupo realtime",
      "Checklist ilimitado",
      "Editar roteiro completo",
    ],
  },
  grupo: {
    id: "grupo",
    nome: "Grupo",
    icon: "⭐",
    cor: "#F59E0B",
    tagline: "Pra família grande / equipe",
    features: [
      "Até 5 viagens",
      "IA com pesquisa online (preços reais)",
      "2.000 mensagens IA por mês",
      "Compartilhar com até 20 pessoas",
      "Chat do grupo realtime",
      "Checklist ilimitado",
      "Editar roteiro completo",
    ],
  },
  // Plano interno — não aparece em PricingSection nem PlanPicker.
  // Atribuído manualmente via SQL pra owners do produto.
  owner: {
    id: "owner",
    nome: "Owner",
    icon: "👑",
    cor: "#EAB308",
    tagline: "Acesso total",
    features: [
      "Tudo ilimitado",
      "Sem cobrança",
      "Bypass em todos os gates",
    ],
    hidden: true, // sinal pra UI pública pular esse plano
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
  free: {
    viagens: 1,
    iaMsgsDia: 5,
    iaMsgsMes: null,
    membros: 1,
    checklist: 5,
    chat: false,
    admin: true,
    pesquisa: false,
    compartilhar: false,
  },
  pro: {
    viagens: 3,
    iaMsgsDia: null,
    iaMsgsMes: 500,
    membros: 5,
    checklist: null,
    chat: true,
    admin: true,
    pesquisa: true,
    compartilhar: true,
  },
  grupo: {
    viagens: 5,
    iaMsgsDia: null,
    iaMsgsMes: 2000,
    membros: 20,
    checklist: null,
    chat: true,
    admin: true,
    pesquisa: true,
    compartilhar: true,
  },
  owner: {
    viagens: Infinity,
    iaMsgsDia: null,
    iaMsgsMes: Infinity,
    membros: Infinity,
    checklist: Infinity,
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
  return plano === "pro" || plano === "grupo" || plano === "owner";
}

export function isOwner(plano) {
  return plano === "owner";
}

// Formatação curta de preço pra cards / botões.
export function priceLabel(plano, ciclo) {
  const p = PRICES[plano]?.[ciclo];
  if (!p) return "—";
  return p.display;
}

// Preço/mês equivalente quando ciclo=anual (pra mostrar "R$ 10/mês" embaixo do anual).
export function monthlyEquivalent(plano, ciclo) {
  const p = PRICES[plano]?.[ciclo];
  if (!p) return null;
  if (ciclo === "anual") return Math.round((p.amount / 12) * 100) / 100;
  return p.amount;
}
