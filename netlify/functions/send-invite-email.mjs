// /api/send-invite-email — manda o email de convite via Resend.
//
// Stub mode: se RESEND_API_KEY ausente, loga warning + retorna { ok:true,
// stub:true }. Permite o feature funcionar (criar convite + copiar link)
// mesmo antes do dom DNS estar configurado.
//
// Pra ativar:
//   1. Sign up em resend.com
//   2. Verificar dominio viajjei.com.br (SPF + DKIM no DNS)
//   3. Setar RESEND_API_KEY no Netlify env
//
// AUTH: exige Authorization: Bearer <jwt>. O JWT precisa ter sido emitido
// pra um user que é admin_of(viagem_id), porque essa função:
//   1. Re-valida via /auth/v1/user (token forjado falha)
//   2. Confirma que o user é admin da viagem (RLS read em viagem_membros
//      via PostgREST com o token do user) — quem não é admin não pode
//      mandar email convidando pra viagem alheia mesmo tendo cupom-style
//      token em mãos. Defense in depth.
//
// Rate-limit: 10 emails/min/user, 30/min/IP. Spamming via UI tem custo.

import { rateLimit, getClientIp } from "./_lib/rate-limit.mjs";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SITE_BASE = process.env.URL
  || process.env.DEPLOY_PRIME_URL
  || "https://viajjei.com.br";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

// Sender: precisa estar em domínio verificado na Resend.
const SENDER = process.env.INVITE_SENDER_EMAIL || "Viajjei <convites@viajjei.com.br>";

let warnedStub = false;
function warnStub() {
  if (warnedStub) return;
  warnedStub = true;
  console.warn("[send-invite] RESEND_API_KEY ausente — stub mode (não envia, retorna ok).");
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function fmtDateBR(iso) {
  if (!iso) return "";
  try {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  } catch { return ""; }
}

async function verifyAuth(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || !SUPABASE_URL) return null;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { user, token } : null;
  } catch (err) {
    console.error("[send-invite] verifyAuth erro:", err);
    return null;
  }
}

// Confirma is_admin_of via PostgREST. Re-valida server-side mesmo que o
// frontend "já checou" — atacante autenticado podia chamar nossa função
// passando viagem_id alheio só pra spam o email do alvo.
async function isAdminOfTrip(viagemId, userToken) {
  if (!SUPABASE_URL || !viagemId) return false;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/is_admin_of`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ viagem_uuid: viagemId }),
    });
    if (!res.ok) return false;
    const r = await res.json();
    return r === true;
  } catch (err) {
    console.error("[send-invite] isAdminOfTrip erro:", err);
    return false;
  }
}

function buildHtml({ inviterNome, tripNome, tripCidades, tripDataIni, tripDataFim, acceptUrl }) {
  const cidades = (tripCidades && tripCidades.length) ? tripCidades.join(" · ") : "";
  const datas = tripDataIni
    ? `${fmtDateBR(tripDataIni)}${tripDataFim ? " → " + fmtDateBR(tripDataFim) : ""}`
    : "";
  const facts = [datas, cidades].filter(Boolean).join(" • ");
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F9FAFB;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">
        <tr><td style="background:linear-gradient(135deg,#F97316 0%,#FB923C 100%);padding:24px;text-align:center;">
          <div style="font-size:32px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">Viajjei 🧳</div>
          <div style="color:#FFE4D5;font-size:13px;margin-top:4px;font-weight:600;">Sempre Juntos</div>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 16px;font-size:16px;color:#0F172A;line-height:1.5;">
            <strong>${escapeHtml(inviterNome || "Alguém")}</strong> te convidou pra organizar uma viagem juntos:
          </p>
          <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin-bottom:24px;">
            <div style="font-size:18px;font-weight:800;color:#0F172A;margin-bottom:4px;">${escapeHtml(tripNome)}</div>
            ${facts ? `<div style="font-size:13px;color:#6B7280;">${escapeHtml(facts)}</div>` : ""}
          </div>
          <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.5;">
            O Viajjei é onde a galera planeja junto: o Jei (nosso concierge de IA) pesquisa hotéis e passeios com preço real, e todo mundo vê o roteiro no mesmo lugar.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
            <tr><td style="border-radius:12px;background:#F97316;">
              <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;padding:14px 28px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">
                Aceitar convite →
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;line-height:1.5;text-align:center;">
            Esse convite expira em 7 dias.<br>
            Se o botão não funcionar, copie e cole esse link no navegador:<br>
            <a href="${escapeHtml(acceptUrl)}" style="color:#F97316;word-break:break-all;">${escapeHtml(acceptUrl)}</a>
          </p>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:16px;text-align:center;font-size:11px;color:#9CA3AF;">
          Recebeu por engano? É só ignorar — sem cadastro, sem conta criada.<br>
          Viajjei · <a href="https://viajjei.com.br" style="color:#9CA3AF;">viajjei.com.br</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildText({ inviterNome, tripNome, tripCidades, tripDataIni, tripDataFim, acceptUrl }) {
  const cidades = (tripCidades && tripCidades.length) ? tripCidades.join(", ") : "";
  const datas = tripDataIni
    ? `${fmtDateBR(tripDataIni)}${tripDataFim ? " → " + fmtDateBR(tripDataFim) : ""}`
    : "";
  return [
    `${inviterNome || "Alguém"} te convidou pra organizar uma viagem juntos: ${tripNome}`,
    datas ? `Datas: ${datas}` : null,
    cidades ? `Destino: ${cidades}` : null,
    "",
    "O Viajjei é onde a galera planeja junto. O Jei pesquisa hotéis e passeios com preço real e todo mundo vê o roteiro no mesmo lugar.",
    "",
    `Aceitar convite: ${acceptUrl}`,
    "",
    "Esse convite expira em 7 dias. Recebeu por engano? Pode ignorar.",
    "Viajjei · viajjei.com.br",
  ].filter((x) => x !== null).join("\n");
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authed = await verifyAuth(req);
  if (!authed) return jsonResponse({ error: "Não autenticado." }, 401);
  const { user, token } = authed;

  const ip = getClientIp(req);
  const rl = await Promise.all([
    rateLimit({ key: `invite-email:user:${user.id}`, limit: 10, windowSec: 60 }),
    rateLimit({ key: `invite-email:ip:${ip}`, limit: 30, windowSec: 60 }),
  ]);
  const blocked = rl.find((r) => !r.ok);
  if (blocked) {
    const resetIn = blocked.resetAt ? Math.max(1, Math.ceil((blocked.resetAt - Date.now()) / 1000)) : 60;
    return jsonResponse({ error: `Muitos convites. Tenta de novo em ${resetIn}s.` }, 429);
  }

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Requisição inválida." }, 400); }

  const { viagem_id, invite_token, email, inviter_nome, trip } = body ?? {};
  if (!viagem_id || !invite_token || !email || !trip?.nome) {
    return jsonResponse({ error: "Faltam campos." }, 400);
  }
  // Validação extra: o JWT do caller é admin da viagem? RPC já validou
  // no INSERT, mas aqui é defense-in-depth contra reutilização indevida
  // de função (atacante que tem token de convite mas não é admin tenta
  // spam de email via /api/send-invite-email).
  if (!(await isAdminOfTrip(viagem_id, token))) {
    return jsonResponse({ error: "Permissão negada." }, 403);
  }

  const acceptUrl = `${SITE_BASE}/aceitar-convite?token=${encodeURIComponent(invite_token)}`;
  const subject = `${inviter_nome || "Alguém"} te convidou pra viagem ${trip.nome}`;
  const html = buildHtml({
    inviterNome: inviter_nome, tripNome: trip.nome,
    tripCidades: trip.cidades, tripDataIni: trip.data_inicio, tripDataFim: trip.data_fim,
    acceptUrl,
  });
  const text = buildText({
    inviterNome: inviter_nome, tripNome: trip.nome,
    tripCidades: trip.cidades, tripDataIni: trip.data_inicio, tripDataFim: trip.data_fim,
    acceptUrl,
  });

  if (!RESEND_API_KEY) {
    warnStub();
    console.log("[send-invite][stub] would send to", email, "subject:", subject);
    return jsonResponse({ ok: true, stub: true, accept_url: acceptUrl });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SENDER,
        to: [email],
        subject,
        html,
        text,
        // tag pra filtragem no painel Resend e métricas futuras
        tags: [{ name: "category", value: "trip-invite" }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[send-invite] Resend error:", res.status, data);
      // Não bloqueia o flow — convite já foi criado no banco. Frontend
      // mostra "link copiável" como fallback. Retornamos 200 com warning.
      return jsonResponse({
        ok: true, sent: false, accept_url: acceptUrl,
        warning: "Email não enviado. Compartilhe o link manualmente.",
        resend_status: res.status,
      });
    }
    return jsonResponse({ ok: true, sent: true, accept_url: acceptUrl, message_id: data?.id });
  } catch (err) {
    console.error("[send-invite] fetch erro:", err);
    return jsonResponse({
      ok: true, sent: false, accept_url: acceptUrl,
      warning: "Email não enviado. Compartilhe o link manualmente.",
    });
  }
};

export const config = { path: "/api/send-invite-email" };
