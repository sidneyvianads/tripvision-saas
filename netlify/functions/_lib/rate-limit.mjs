// Rate limiter usando Upstash Redis REST API.
//
// Modo stub: se UPSTASH_REDIS_REST_URL/TOKEN não estão setados, retorna
// sempre ok:true — funciona como no-op pra desenvolvimento. Quando setado,
// usa bucket fixo de N segundos (sliding-window approximation com INCR+EXPIRE).
//
// Pra ativar em produção:
//   1. Criar database em https://upstash.com (free tier: 10k req/dia)
//   2. Copiar REST URL + token
//   3. Setar UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN no Netlify
//
// Estratégia "fail-open com circuit breaker leve" (A2 — Padrão #14/#39 do CRM
// Multvision): se o Upstash ficar offline, o endpoint LIBERA (não derruba o Jei
// pra todo mundo por causa da infra de rate limit cair) — mas LOGA ALTO pra ser
// visível, e abre um circuit breaker pra parar de martelar o Upstash (e de pagar
// o timeout em CADA request) enquanto ele está fora. O risco de abuso numa janela
// curta de Upstash-down é menor que o de derrubar o produto pra pagantes.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

// Timeout curto: sem isso, um Upstash pendurado adiciona latência até o teto da
// function (26s) em toda request. 2s é folgado pro REST do Upstash (p99 << 1s).
const UPSTASH_TIMEOUT_MS = 2_000;
// Circuit breaker: após N falhas consecutivas, considera o Upstash fora e para
// de chamá-lo por COOLDOWN_MS (fail-open direto). Depois do cooldown, deixa UMA
// request "tentar" (half-open) — se passar, fecha o circuit.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;

// Estado por instância da function (best-effort; cada container quente tem o seu).
let consecutiveFailures = 0;
let breakerOpenUntil = 0;
let warnedStub = false;

function warnStubOnce() {
  if (warnedStub) return;
  warnedStub = true;
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN ausentes — rate limiting desativado (stub mode)."
  );
}

// Registra falha do Upstash e abre o circuit ao cruzar o threshold. Sempre
// fail-open (retorna ok:true) — quem chama nunca é bloqueado por infra fora.
function recordFailure(reason) {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_THRESHOLD && breakerOpenUntil <= Date.now()) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    console.error(
      `[rate-limit] upstash down, fail-open — circuit ABERTO por ${BREAKER_COOLDOWN_MS / 1000}s ` +
        `após ${consecutiveFailures} falhas (${reason})`
    );
  } else {
    console.warn(`[rate-limit] upstash falha ${consecutiveFailures}/${BREAKER_THRESHOLD}, fail-open: ${reason}`);
  }
  return { ok: true, remaining: null, resetAt: null, error: true };
}

function recordSuccess() {
  if (consecutiveFailures > 0 || breakerOpenUntil > 0) {
    console.warn("[rate-limit] upstash recuperado — circuit FECHADO");
  }
  consecutiveFailures = 0;
  breakerOpenUntil = 0;
}

// Extrai o IP do client. Em Netlify, x-forwarded-for traz uma lista
// "client, proxy1, proxy2". O primeiro é o IP do client real.
export function getClientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip") || req.headers.get("x-nf-client-connection-ip");
  return realIp || "unknown";
}

/**
 * Increment a sliding window counter and check whether the key is within
 * the limit. Returns { ok, remaining, resetAt, stub? }.
 *
 * @param {object} opts
 * @param {string} opts.key - unique key (ex: "plan:user:abc" or "plan:ip:1.2.3.4")
 * @param {number} opts.limit - max requests per window
 * @param {number} opts.windowSec - window in seconds (typical: 60)
 */
export async function rateLimit({ key, limit, windowSec }) {
  if (!ENABLED) {
    warnStubOnce();
    return { ok: true, remaining: limit, resetAt: null, stub: true };
  }

  // Circuit aberto: Upstash está fora (detectado por falhas consecutivas).
  // Fail-open direto, sem chamar o Upstash nem pagar o timeout.
  if (breakerOpenUntil > Date.now()) {
    return { ok: true, remaining: null, resetAt: null, error: true, breakerOpen: true };
  }

  // Bucket fixo — INCR atômico + EXPIRE NX cria janela rolante de até windowSec.
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const redisKey = `rl:${key}:${bucket}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS);
  try {
    const res = await fetch(`${UPSTASH_URL.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSec), "NX"],
      ]),
      signal: controller.signal,
    });
    if (!res.ok) {
      return recordFailure(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const count = Number(data?.[0]?.result ?? 0);
    const remaining = Math.max(0, limit - count);
    const resetAt = (bucket + 1) * windowSec * 1000;
    recordSuccess();
    return { ok: count <= limit, remaining, resetAt };
  } catch (err) {
    const reason = err?.name === "AbortError" ? `timeout ${UPSTASH_TIMEOUT_MS}ms` : (err?.message ?? String(err));
    return recordFailure(reason);
  } finally {
    clearTimeout(timer);
  }
}
