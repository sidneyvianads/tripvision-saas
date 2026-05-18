// R28-1: helpers compartilhados entre plan.mjs e chat.mjs.
// Antes a função buildMessagesWithCache estava duplicada nos dois
// arquivos — mesmo código, mesma intenção. Extrair pra cá evita
// dois lugares se desincronizarem na próxima vez que alguém ajustar
// o breakpoint do cache.

/**
 * Constrói o array `messages` pro endpoint Anthropic /v1/messages
 * com cache_control breakpoint na penúltima mensagem do histórico.
 *
 * Estratégia: o prompt cache da Anthropic cobra ~10% do preço normal
 * em tokens que repetem entre requests (TTL 5min). Marcar a 3a-de-trás-
 * pra-frente significa: tudo ANTES dela é cacheado (estável entre
 * turnos), as 2 últimas + a nova msg do user são novas (não cabe cache).
 *
 * Como cache_control em content block requer formato array, convertemos
 * só a msg do breakpoint pra { type: "text", text, cache_control }.
 *
 * Sem cache (history < 3): retorna o array simples sem markers — não
 * vale a pena marcar se não há histórico suficiente pra economizar.
 *
 * @param {Array<{role: string, content: string}>} history
 * @param {string} userMessage
 * @returns {Array} formato pronto pra POST anthropic /v1/messages
 */
export function buildMessagesWithCache(history, userMessage) {
  const baseHistory = history.map((m) => ({ role: m.role, content: m.content }));
  if (baseHistory.length >= 3) {
    const breakpointIdx = baseHistory.length - 3;
    baseHistory[breakpointIdx] = {
      role: baseHistory[breakpointIdx].role,
      content: [{
        type: "text",
        text: baseHistory[breakpointIdx].content,
        cache_control: { type: "ephemeral" },
      }],
    };
  }
  return [...baseHistory, { role: "user", content: userMessage }];
}
