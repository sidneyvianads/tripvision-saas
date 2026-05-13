// Planos comerciais do Viajjei SaaS — fonte única da verdade
// Mudanças aqui se propagam pra Pricing, paywall, limites e webhooks.
//
// Modelo atual:
//   - pending : conta criada, sem assinatura ativa (cadastrou mas não pagou ainda, ou cancelou+expirou)
//   - pro     : assinatura Pro ativa
//   - grupo   : assinatura Grupo ativa
//   - owner   : interno, bypass total
//   - free    : legado (usuários antigos). Trate como pending — read-only.
//
// Não existe mais plano gratuito comercial. Todo cadastro novo escolhe Pro ou Grupo
// e recebe 7 dias de trial gerenciado pelo Mercado Pago.

export const PLANS = {
  pro: {
    id: "pro",
    nome: "Pro",
    icon: "✨",
    cor: "#8B5CF6",
    tagline: "Pra viajar de verdade",
    badge: "MAIS POPULAR",
    features: [
      "Até 3 viagens",
      "Jei pesquisa preços reais",
      "500 conversas por mês com o Jei",
      "Compartilhar com até 5 pessoas",
      "Chat do grupo (atualiza na hora)",
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
      "Jei pesquisa preços reais",
      "2.000 conversas por mês com o Jei",
      "Compartilhar com até 20 pessoas",
      "Chat do grupo (atualiza na hora)",
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
    hidden: true,
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

// Trial padrão em dias — Mercado Pago não cobra durante esse período.
export const TRIAL_DAYS = 7;

// Limites técnicos aplicados em runtime.
// "expired" cobre: free (legado), pending (não assinou ainda), e usuários cuja assinatura caducou.
// Sem acesso a Jei, sem criar viagem, sem chat — apenas leitura do que já existe.
export const LIMITS = {
  expired: {
    viagens: 0,           // não pode criar; pode listar/abrir o que já existe
    iaMsgsDia: 0,
    iaMsgsMes: 0,
    membros: 1,
    checklist: 0,
    chat: false,
    admin: false,
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

// Estados que NÃO têm assinatura ativa.
const EXPIRED_STATES = new Set(["free", "pending", "expired", null, undefined]);

export function getLimits(plano) {
  if (LIMITS[plano]) return LIMITS[plano];
  return LIMITS.expired;
}

export function planName(plano) {
  return PLANS[plano]?.nome ?? "—";
}

export function planIcon(plano) {
  return PLANS[plano]?.icon ?? "🧳";
}

// "Plano pago" = pro/grupo/owner E (owner OU assinatura não expirada).
// Aceita o user inteiro pra checar plano_expires_at.
export function isPaid(plano) {
  return plano === "pro" || plano === "grupo" || plano === "owner";
}

export function isOwner(plano) {
  return plano === "owner";
}

// Verifica se o usuário tem acesso pago efetivo (considera plano_expires_at).
// Owner nunca expira. Free/pending nunca tem acesso.
export function hasActiveAccess(user) {
  if (!user) return false;
  if (user.plano === "owner") return true;
  if (EXPIRED_STATES.has(user.plano)) return false;
  if (!user.plano_expires_at) return true; // sem data = trate como ativo
  return new Date(user.plano_expires_at).getTime() > Date.now();
}

// Conta sem assinatura: precisa do upgrade pra liberar a maior parte do app.
export function needsSubscription(user) {
  if (!user) return false;
  return !hasActiveAccess(user);
}

// Está em período de trial gratuito (7 dias)?
export function isInTrial(user) {
  if (!user?.trial_ends_at) return false;
  return new Date(user.trial_ends_at).getTime() > Date.now();
}

// Dias restantes do trial (0 se já acabou ou não tem trial).
export function trialDaysLeft(user) {
  if (!user?.trial_ends_at) return 0;
  const ms = new Date(user.trial_ends_at).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
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
