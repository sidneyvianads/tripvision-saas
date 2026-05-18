// R23-3: cron mensal pra truncar histórico antigo de ia_conversas.
//
// Schedule: "0 4 1 * *" — dia 1º de cada mês, 04:00 UTC (01:00 BRT).
// Coincide com início do novo ciclo de billing (count_in_month reseta).
//
// O quê: chama RPC truncate_old_ia_messages(50) que mantém só as
// últimas 50 mensagens em cada conversa. Não afeta ia_conversa_log
// (R23-1) — count_in_month continua exato porque lê da log.
//
// Auth: usa SUPABASE_SERVICE_KEY. A RPC tem guard que aceita caller
// NULL (service_role context) — frontend user normal é bloqueado pelo
// outro guard (auth.uid != null AND NOT is_platform_owner).
//
// Idempotente: rodar 2× seguido não causa erro. Segunda execução
// retorna rows_processed=0 porque já truncou no primeiro run.

import { captureException } from "./_lib/sentry.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

// Quantas msgs manter por conversa. UI mostra histórico recente; Jei
// usa apenas as últimas 10 pra contexto (sanitizedHistory.slice(-10) em
// netlify/functions/plan.mjs). 50 cobre 5× margem confortável.
const KEEP_LAST = 50;

export default async () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[cron-truncate-ia] env vars ausentes");
    return new Response(JSON.stringify({ error: "missing env" }), { status: 500 });
  }

  const startMs = Date.now();
  console.log("[cron-truncate-ia] start", { keep_last: KEEP_LAST });

  try {
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/truncate_old_ia_messages`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_keep_last: KEEP_LAST }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.error("[cron-truncate-ia] RPC erro:", res.status, txt);
      captureException(new Error(`truncate RPC ${res.status}: ${txt}`), {
        source: "cron-truncate-ia",
      });
      return new Response(JSON.stringify({ error: "rpc failed", status: res.status }), { status: 500 });
    }

    const stats = await res.json();
    const elapsedMs = Date.now() - startMs;
    console.log("[cron-truncate-ia] done", { ...stats, elapsed_ms: elapsedMs });

    return new Response(JSON.stringify({ ...stats, elapsed_ms: elapsedMs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron-truncate-ia] erro geral:", err);
    captureException(err, { source: "cron-truncate-ia" });
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

// Schedule: dia 1º de cada mês, 04:00 UTC (01:00 BRT).
// O cron coincide com início do ciclo de count_in_month — qualquer
// truncate de msgs do mês anterior já não afeta o gate atual.
export const config = { schedule: "0 4 1 * *" };
