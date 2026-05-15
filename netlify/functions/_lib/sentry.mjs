// Sentry stub para Netlify Functions (server-side).
//
// Mesma interface da versão browser (src/lib/sentry.js). Modo stub
// (sem SENTRY_DSN no env): captureException loga e nada mais.
//
// Pra ativar:
//   1. npm install @sentry/node
//   2. Criar projeto Node em sentry.io
//   3. Setar SENTRY_DSN no Netlify
//   4. Trocar este stub pela init do @sentry/node mantendo a interface.

const DSN = process.env.SENTRY_DSN;
const ENABLED = !!DSN;

export function captureException(err, context) {
  if (!ENABLED) {
    console.error("[sentry:stub]", err?.message ?? err, context ?? "");
    if (err?.stack) console.error(err.stack);
    return;
  }
  // TODO: Sentry.captureException(err, { extra: context });
  console.error("[sentry:pending]", err?.message ?? err, context ?? "");
}

export function captureMessage(msg, level = "info", context) {
  if (!ENABLED) {
    const fn = level === "error" ? console.error : level === "warning" ? console.warn : console.log;
    fn(`[sentry:stub:${level}]`, msg, context ?? "");
    return;
  }
  // TODO: Sentry.captureMessage(msg, { level, extra: context });
}
