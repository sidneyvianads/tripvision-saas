// Sentry stub — interface mínima compatível com @sentry/react.
//
// Modo stub (sem VITE_SENTRY_DSN): captureException loga em console.error
// e nada mais. Não envia nada pra fora.
//
// Pra ativar Sentry de verdade:
//   1. npm install @sentry/react
//   2. Criar projeto em sentry.io e pegar o DSN
//   3. Setar VITE_SENTRY_DSN no .env.local + Netlify
//   4. Trocar este stub pela init real do @sentry/react (BrowserTracing,
//      Replay, integrations etc) — a interface (captureException,
//      captureMessage, setUser) fica igual, então os call sites no app
//      não precisam mudar.

const DSN = import.meta.env.VITE_SENTRY_DSN;
const ENABLED = !!DSN;

let warned = false;
function warnStub() {
  if (warned) return;
  warned = true;
  if (!ENABLED) {
    console.info("[sentry] stub mode — VITE_SENTRY_DSN ausente, errors só vão pro console.");
  }
}

// Inicializa Sentry. No-op no stub; chama @sentry/react.init() quando ativado.
export function initSentry() {
  warnStub();
  // TODO: quando @sentry/react estiver instalado e DSN estiver presente:
  //   Sentry.init({ dsn: DSN, tracesSampleRate: 0.1, replaysSessionSampleRate: 0.05 });
}

// Captura uma exceção. Aceita Error ou string. context é metadata extra.
export function captureException(err, context) {
  if (!ENABLED) {
    console.error("[sentry:stub]", err, context ?? "");
    return;
  }
  // TODO: Sentry.captureException(err, { extra: context });
  console.error("[sentry:pending]", err, context ?? "");
}

// Captura uma mensagem (sem stack). level: "info" | "warning" | "error".
export function captureMessage(msg, level = "info", context) {
  if (!ENABLED) {
    if (level === "error") console.error("[sentry:stub]", msg, context ?? "");
    else if (level === "warning") console.warn("[sentry:stub]", msg, context ?? "");
    return;
  }
  // TODO: Sentry.captureMessage(msg, { level, extra: context });
}

// Liga eventos a um user. Chamado depois do login.
// _user com underscore: param será usado quando Sentry for wired (TODO abaixo).
export function setUser(_user) {
  if (!ENABLED) return;
  // TODO: Sentry.setUser({ id: _user?.id, email: _user?.email });
}

// Limpa contexto do user. Chamado depois do logout.
export function clearUser() {
  if (!ENABLED) return;
  // TODO: Sentry.setUser(null);
}
