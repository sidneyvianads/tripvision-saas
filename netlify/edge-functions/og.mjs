// Edge Function: injeta meta tags OG na index.html pra rotas /v/:slug.
// Bots de preview (WhatsApp, Twitter, Facebook) leem as tags; usuários reais
// recebem o SPA normalmente porque o body fica intacto.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY") || "";

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function fmtDateBR(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T00:00:00");
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
  } catch { return ""; }
}

async function fetchTrip(slug) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/viagens?slug=eq.${encodeURIComponent(slug)}&select=nome,cidades,data_inicio,data_fim,num_pessoas,cover_emoji,tema`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    return arr?.[0] ?? null;
  } catch (e) {
    console.error("[og] fetchTrip error:", e);
    return null;
  }
}

export default async (request, context) => {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/v\/([^/]+)\/?$/);
  if (!match) return context.next();

  const slug = match[1];
  // Pega a SPA shell (index.html)
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const trip = await fetchTrip(slug);
  if (!trip) return response;

  const emoji = trip.cover_emoji ?? "🧳";
  const titulo = `${emoji} ${trip.nome ?? "Viagem"}`;
  const cidades = (trip.cidades ?? []).join(", ");
  const datas = trip.data_inicio
    ? `${fmtDateBR(trip.data_inicio)}${trip.data_fim ? " → " + fmtDateBR(trip.data_fim) : ""}`
    : "";
  const descParts = [];
  if (datas) descParts.push(datas);
  if (cidades) descParts.push(cidades);
  if (trip.num_pessoas) descParts.push(`${trip.num_pessoas} pessoas`);
  descParts.push("Planejado com TripVision");
  const descricao = descParts.join(" · ");

  const ogImage = `${url.origin}/og-default.png`;
  const pageUrl = `${url.origin}/v/${slug}`;

  const meta = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(titulo)}" />
    <meta property="og:description" content="${escapeHtml(descricao)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:site_name" content="TripVision" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(titulo)}" />
    <meta name="twitter:description" content="${escapeHtml(descricao)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    <meta name="description" content="${escapeHtml(descricao)}" />
    <title>${escapeHtml(titulo)} — TripVision</title>
  `.trim();

  let html = await response.text();
  // Substitui o <title> existente e injeta as tags antes de </head>
  html = html.replace(/<title>[^<]*<\/title>/i, "");
  html = html.replace(/<\/head>/i, `${meta}\n</head>`);

  return new Response(html, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
};

export const config = { path: "/v/:slug" };
