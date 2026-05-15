// PostHog stub — funil analítico do Viajjei.
//
// Modo stub (sem VITE_POSTHOG_KEY): track() loga em console.debug e
// nada mais. Não envia nada pra fora.
//
// Pra ativar PostHog de verdade:
//   1. npm install posthog-js
//   2. Criar projeto em posthog.com (Cloud) ou self-hosted
//   3. Setar VITE_POSTHOG_KEY (e opcional VITE_POSTHOG_HOST) no Netlify
//   4. Trocar TODOs pela init real do posthog-js — interface (track, identify,
//      reset) fica igual, então os call sites não mudam.
//
// 7 eventos do funil (canonical):
//   signup_completed       — conta criada com sucesso
//   trip_created           — viagem criada (NewTrip)
//   plan_started           — primeira mensagem mandada pro Jei (de uma viagem)
//   message_sent           — qualquer mensagem mandada pro Jei
//   payment_started        — redirect pro Mercado Pago (init_point)
//   payment_completed      — webhook MP ativou plano (server-side)
//   churn                  — cancelou assinatura (Account → cancel)

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
const ENABLED = !!POSTHOG_KEY;

let warned = false;
function warnStub() {
  if (warned) return;
  warned = true;
  if (!ENABLED) {
    console.info("[analytics] stub mode — VITE_POSTHOG_KEY ausente, eventos só no console.");
  }
}

export function initAnalytics() {
  warnStub();
  // TODO: quando posthog-js estiver instalado e key presente:
  //   import posthog from "posthog-js";
  //   posthog.init(POSTHOG_KEY, {
  //     api_host: POSTHOG_HOST,
  //     capture_pageview: true,
  //     persistence: "localStorage+cookie",
  //   });
}

// Envia evento custom. props vira properties no PostHog.
export function track(event, props) {
  if (!ENABLED) {
    console.debug("[analytics:stub]", event, props ?? "");
    return;
  }
  // TODO: posthog.capture(event, props);
}

// Liga eventos a um user (depois do login/signup).
//
// LGPD: traits com PII (email, nome) só vão pro provedor SE o user
// consentiu explicitamente. O consent é guardado em localStorage
// (viajjei.consent_analytics === "true"). Sem consent, mandamos só
// o user_id (identifier opaco) — suficiente pra cohort/funnel.
//
// Pra coletar consentimento, mostre um banner de cookies que dispara
// setAnalyticsConsent(true). Por enquanto não temos banner — então
// na prática só user_id sai daqui.
export function identify(userId, traits) {
  if (!ENABLED) {
    console.debug("[analytics:stub:identify]", userId, hasConsent() ? traits : "(no PII — sem consent)");
    return;
  }
  // TODO: posthog.identify(userId);  // sempre, ID-only
  // TODO: if (hasConsent() && traits) posthog.setPersonProperties(traits);
}

const CONSENT_KEY = "viajjei.consent_analytics";

export function hasConsent() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(CONSENT_KEY) === "true"; }
  catch { return false; }
}

export function setAnalyticsConsent(consented) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, consented ? "true" : "false");
  } catch {}
}

// Limpa identificação (depois do logout).
export function resetAnalytics() {
  if (!ENABLED) return;
  // TODO: posthog.reset();
}

// ─── Helpers tipados pros 7 eventos do funil ───────────────────────
// (Centraliza nomes pra não escrever strings soltas em N lugares)

export const trackSignupCompleted = (userId, props) =>
  track("signup_completed", { user_id: userId, ...props });

export const trackTripCreated = (tripId, props) =>
  track("trip_created", { trip_id: tripId, ...props });

export const trackPlanStarted = (tripId, props) =>
  track("plan_started", { trip_id: tripId, ...props });

export const trackMessageSent = (tripId, props) =>
  track("message_sent", { trip_id: tripId, ...props });

export const trackPaymentStarted = (plano, ciclo, props) =>
  track("payment_started", { plano, ciclo, ...props });

export const trackChurn = (props) =>
  track("churn", { ...props });
