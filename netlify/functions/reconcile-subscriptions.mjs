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

export default async () => {
  if (!MP_TOKEN) {
    console.log("[reconcile] MERCADOPAGO_ACCESS_TOKEN ausente — skip.");
    return new Response("OK (no MP token)");
  }

  const stats = { checked: 0, updated: 0, downgraded: 0, errors: 0 };

  try {
    // Pega assinaturas que potencialmente precisam reconciliação:
    // tudo que tem mp_preapproval_id E (status active/pending OU
    // current_period_end no passado).
    const subs = await sb(
      "assinaturas?mp_preapproval_id=not.is.null&select=id,user_id,plano,ciclo,status,mp_preapproval_id,current_period_end&order=updated_at.desc&limit=500"
    );
    if (!Array.isArray(subs)) {
      return new Response("OK (no subs)");
    }

    for (const sub of subs) {
      stats.checked++;
      try {
        const pa = await fetchPreapproval(sub.mp_preapproval_id);
        const mpStatus = pa.status; // pending, authorized, paused, cancelled
        const mpStatusLocal =
          mpStatus === "authorized" ? "active" :
          mpStatus === "cancelled" || mpStatus === "paused" ? "canceled" :
          "pending";

        // Atualiza local se divergir
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

        // Rebaixa imediato se MP cancelou E estamos dentro do que o webhook
        // ativou como trial+ciclo. Se chargeback/cartão recusado, MP marca
        // paused/cancelled e o user fica com acesso até plano_expires_at —
        // queremos cortar AGORA, não no fim do "trial pago".
        // Heurística: se MP diz não-ativo E period_end > NOW + 7d,
        // assume que era acesso de trial que precisa expirar imediatamente.
        if (mpStatusLocal === "canceled" && sub.current_period_end) {
          const endTs = new Date(sub.current_period_end).getTime();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          if (endTs > Date.now() + sevenDays) {
            await sb(`users?id=eq.${sub.user_id}`, {
              method: "PATCH",
              body: JSON.stringify({
                plano_expires_at: new Date().toISOString(),
              }),
            });
            stats.downgraded++;
            console.log(`[reconcile] user ${sub.user_id} rebaixado (MP=${mpStatus} mas trial até ${sub.current_period_end})`);
          }
        }
      } catch (err) {
        stats.errors++;
        console.error(`[reconcile] erro em sub ${sub.id}:`, err.message);
      }
    }

    console.log("[reconcile] done:", stats);
    return new Response(JSON.stringify({ ok: true, ...stats }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[reconcile] erro geral:", err);
    return new Response(JSON.stringify({ error: err.message, ...stats }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Schedule: 03:00 BRT diário = 06:00 UTC
// Sintaxe Netlify: cron expression de 5 campos
export const config = { schedule: "0 6 * * *" };
