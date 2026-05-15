// Netlify Scheduled Function — roda diariamente às 03:00 BRT (06:00 UTC).
//
// Reconcilia public.users.plano_expires_at com a verdade do Mercado Pago.
//
// Problema que resolve:
// O webhook MP é confiável pra ativação, mas pode silenciar em edge cases
// (5xx perdidos antes da fix do commit 6db3e4a, MP rate-limits no nosso
// notification_url, etc). Sem reconciliação, users com cartão recusado/
// chargeback ficam com plano_expires_at futuro e acesso pago grátis.
//
// O que faz:
// 1) Lê todas as assinaturas com mp_preapproval_id setado.
// 2) Pra cada uma, GET /preapproval/{id} no MP.
// 3) Atualiza assinaturas.status local conforme verdade do MP.
// 4) Se MP diz "cancelled"/"paused" e estamos dentro do trial → força
//    plano_expires_at = NOW (rebaixa imediato).
// 5) Se MP diz "authorized" e plano_expires_at < NOW → estende (caso
//    webhook de renovação tenha sido perdido).
//
// NÃO TOCA users com mp_preapproval_id NULL — preserva clientes legados
// (Sidney owner, Renata/Victor/Michelly pre-MP que vc liberou manualmente).
//
// Pra ativar: GA no Netlify (Functions → Scheduled). Free tier inclui.

import { captureException, captureMessage } from "./_lib/sentry.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || "";

async function sb(path, init = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env ausente.");
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchPreapproval(id) {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`MP ${res.status}: ${t.slice(0, 100)}`);
  }
  return res.json();
}

// Processa uma sub: GET MP + diff status local + heurística rebaixamento.
// Isolada pra rodar em paralelo via Promise.allSettled.
async function reconcileOne(sub, stats) {
  try {
    const pa = await fetchPreapproval(sub.mp_preapproval_id);
    const mpStatus = pa.status; // pending, authorized, paused, cancelled
    const mpStatusLocal =
      mpStatus === "authorized" ? "active" :
      mpStatus === "cancelled" || mpStatus === "paused" ? "canceled" :
      "pending";

    if (sub.status !== mpStatusLocal) {
      await sb(`assinaturas?id=eq.${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: mpStatusLocal,
          updated_at: new Date().toISOString(),
        }),
      });
      stats.updated++;
      console.log(`[reconcile] ${sub.id}: ${sub.status} → ${mpStatusLocal} (MP=${mpStatus})`);
    }

    // Heurística de rebaixamento por ciclo:
    // - Mensal: rebaixa se period_end > NOW + 30d (trial+1mês ativado e cancelado dentro do trial).
    // - Anual: rebaixa só se period_end > NOW + 380d (trial+1ano e cancelou ANTES de pagar).
    //   Sem isso, anual cancelado no mês 11 roubaria 60 dias pagos.
    if (mpStatusLocal === "canceled" && sub.current_period_end) {
      const endTs = new Date(sub.current_period_end).getTime();
      const cutoffMs = (sub.ciclo === "anual" ? 380 : 30) * 24 * 60 * 60 * 1000;
      if (endTs > Date.now() + cutoffMs) {
        // Rebaixa AMBOS plano_expires_at E trial_ends_at. Antes só
        // plano_expires_at → UI mostrava "Trial" pra user cancelado
        // e métricas de trial contavam errado.
        const now = new Date().toISOString();
        await sb(`users?id=eq.${sub.user_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            plano_expires_at: now,
            trial_ends_at: now,
          }),
        });
        stats.downgraded++;
        console.log(`[reconcile] user ${sub.user_id} rebaixado (MP=${mpStatus}, ciclo=${sub.ciclo}, period_end=${sub.current_period_end})`);
      }
    }
  } catch (err) {
    stats.errors++;
    console.error(`[reconcile] erro em sub ${sub.id}:`, err.message);
    captureException(err, { sub_id: sub.id, mp_preapproval_id: sub.mp_preapproval_id });
  }
}

export default async () => {
  if (!MP_TOKEN) {
    console.log("[reconcile] MERCADOPAGO_ACCESS_TOKEN ausente — skip.");
    captureMessage("reconcile: MP token ausente", "warning", {});
    return new Response("OK (no MP token)");
  }

  const stats = { checked: 0, updated: 0, downgraded: 0, errors: 0 };
  const BATCH = 20;
  const TIMEBUDGET_MS = 22_000; // deixa 4s de margem antes do timeout 26s
  const t0 = Date.now();

  try {
    // Ordena por updated_at ASC: as mais antigas (provavelmente menos vistas)
    // vão primeiro. Próxima execução cobre as próximas. Cap de 200 por run
    // pra não estourar timeout — a 20 paralelos × 2s = 20s pra 200 subs.
    const subs = await sb(
      "assinaturas?mp_preapproval_id=not.is.null&select=id,user_id,plano,ciclo,status,mp_preapproval_id,current_period_end&order=updated_at.asc&limit=200"
    );
    if (!Array.isArray(subs) || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, ...stats, message: "no subs" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Batches paralelos com Promise.allSettled — uma falha não derruba o lote.
    for (let i = 0; i < subs.length; i += BATCH) {
      if (Date.now() - t0 > TIMEBUDGET_MS) {
        console.warn(`[reconcile] orçamento de tempo atingido — paramos em ${stats.checked}/${subs.length}.`);
        break;
      }
      const slice = subs.slice(i, i + BATCH);
      stats.checked += slice.length;
      await Promise.allSettled(slice.map((s) => reconcileOne(s, stats)));
    }

    console.log("[reconcile] done:", stats);
    return new Response(JSON.stringify({ ok: true, ...stats }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[reconcile] erro geral:", err);
    captureException(err, { source: "reconcile-subscriptions" });
    return new Response(JSON.stringify({ error: err.message, ...stats }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Schedule: 03:00 BRT diário = 06:00 UTC. maxDuration: 26s (limite Netlify).
// Cap de 200 subs por run + batches de 20 paralelos cabe no orçamento.
// Quando passar de ~200 subs ativas, rodar 4x/dia (ex: "0 */6 * * *")
// ou migrar pra Supabase Edge Function (sem timeout).
export const config = { schedule: "0 6 * * *" };
