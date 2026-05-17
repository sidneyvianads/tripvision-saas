// Storage helper — fonte única de verdade pra chaves localStorage com
// escopo de sessão (morrem no signOut/delete account).
//
// Por que isto existe: tínhamos cupom/origem/plan-usage/roteiro-cache
// espalhados em 4 módulos, cada um com try/catch próprio. signOut
// precisava enumerar todos no useAuth (R12-2). Toda key nova exigia
// lembrar de adicionar lá — e o frontend tem ainda contas com sufixo
// `delete account` que precisam do mesmo cleanup.
//
// Esta lib resolve isso centralizando:
//   - SESSION_SCOPED_KEYS: chaves fixas que pertencem ao user logado
//   - SESSION_SCOPED_PREFIXES: prefixos com sufixo dinâmico (viagemId etc)
//   - clearSessionScopedStorage(): wipe + try/catch (Safari ITP-safe)
//
// NÃO migra namespaces antigos (viajjei. vs viajjei: vs tripvision:):
// migração exigiria leitura fallback por meses pra users existentes não
// perderem cupom capturado / utm tracking / consent LGPD. Mantemos os
// nomes legados; o objetivo aqui é centralizar a LISTA, não unificar o
// schema. Quando uma key nova nascer, adicione AQUI e nada mais.

export const SESSION_SCOPED_KEYS = Object.freeze([
  "viajjei:cupom",
  "viajjei:origem",
  "tripvision-saas:plan-usage:v3",
]);

export const SESSION_SCOPED_PREFIXES = Object.freeze([
  "tripvision:roteiro:",
]);

// NÃO incluímos:
//   - viajjei.auth (supabase.auth.signOut já trata)
//   - viajjei.consent_analytics (LGPD é do dispositivo, não da sessão)

export function clearSessionScopedStorage() {
  if (typeof window === "undefined") return;
  try {
    for (const k of SESSION_SCOPED_KEYS) {
      window.localStorage.removeItem(k);
    }
    // Object.keys uma única vez pra fazer sweep dos prefixos.
    const all = Object.keys(window.localStorage);
    for (const k of all) {
      if (SESSION_SCOPED_PREFIXES.some((p) => k.startsWith(p))) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // localStorage pode estar inacessível (Safari ITP, modo privado iframe,
    // QuotaExceededError raro). Falhar silenciosamente é ok — o pior caso
    // é resíduo no device do user.
  }
}
