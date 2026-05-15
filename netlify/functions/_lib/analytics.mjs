// PostHog stub para Netlify Functions (server-side).
// Espelha src/lib/analytics.js. Usado pra eventos que só conseguem
// ser disparados no servidor — principal: payment_completed (acionado
// pelo webhook do MP quando o preapproval é authorized).
//
// Stub mode: sem POSTHOG_KEY no env, loga em console.debug e nada mais.
//
// Pra ativar:
//   1. Pegar PROJECT API KEY do PostHog (mesma do browser ou um project key
//      separado pra server-side é recomendado)
//   2. Setar POSTHOG_KEY (e POSTHOG_HOST opcional) no Netlify
//   3. Substituir o TODO pela call real do posthog-node:
//      import { PostHog } from "posthog-node";
//      const client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
//      client.capture({ distinctId: userId, event, properties });

const POSTHOG_KEY = process.env.POSTHOG_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
const ENABLED = !!POSTHOG_KEY;

export function track(userId, event, props) {
  if (!ENABLED) {
    console.debug("[analytics:stub]", event, { user_id: userId, ...(props ?? {}) });
    return;
  }
  // TODO: client.capture({ distinctId: userId, event, properties: props });
}

export const trackPaymentCompleted = (userId, props) =>
  track(userId, "payment_completed", props);
