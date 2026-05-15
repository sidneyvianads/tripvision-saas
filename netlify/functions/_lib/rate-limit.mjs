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
// Estratégia "fail-open": se Upstash ficar offline, deixa passar (não derrubar
// produção por causa de Redis indisponível). Logamos warning pra investigar.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

let warnedStub = false;
function warnStubOnce() {
  if (warnedStub) return;
  warnedStub = true;
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN ausentes — rate limiting desativado (stub mode)."
  );
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

  // Bucket fixo — INCR atômico + EXPIRE NX cria janela rolante de até windowSec.
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const redisKey = `rl:${key}:${bucket}`;

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
    });
    if (!res.ok) {
      console.warn("[rate-limit] upstash HTTP error, fail-open:", res.status);
      return { ok: true, remaining: limit, resetAt: null, error: true };
    }
    const data = await res.json();
    const count = Number(data?.[0]?.result ?? 0);
    const remaining = Math.max(0, limit - count);
    const resetAt = (bucket + 1) * windowSec * 1000;
    return { ok: count <= limit, remaining, resetAt };
  } catch (err) {
    console.warn("[rate-limit] erro upstream, fail-open:", err?.message ?? err);
    return { ok: true, remaining: limit, resetAt: null, error: true };
  }
}
