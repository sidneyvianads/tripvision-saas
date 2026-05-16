// withRetry compartilhado — antes duplicado em plan.mjs e chat.mjs.
// Aplicado nos endpoints que chamam serviços externos (Mercado Pago,
// Anthropic, OpenAI, Gemini, Supabase REST). Erros 5xx transitórios
// ou network blip viram retry automático em vez de falha imediata.
//
// Uso:
//   import { withRetry } from "./_lib/retry.mjs";
//   const data = await withRetry(() => fetch("..."), "label", 2, 1000);

export async function withRetry(fn, label, attempts = 2, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`[retry/${label}] tentativa ${i + 1}/${attempts} falhou:`, err?.message ?? err);
      if (i < attempts - 1) {
        // Backoff linear: 1s, 2s, 3s... Suficiente pra blip transitório.
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}
