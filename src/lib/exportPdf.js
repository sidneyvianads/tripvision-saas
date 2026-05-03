// Export roteiro pra PDF via html2canvas + jsPDF.
// Renderiza um HTML offscreen com layout otimizado pra A4 e converte.

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ACTIVITY_TYPES } from "../data/types";
import { getTema } from "../data/themes";

const A4_W_MM = 210;
const A4_H_MM = 297;

const fmtDate = (iso) => {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(new Date(iso + "T00:00:00")); }
  catch { return iso; }
};

function buildHtml(trip, days, contatos, tema) {
  const cidades = (trip.cidades ?? []).join(" · ") || "—";
  const datas = trip.data_inicio
    ? `${fmtDate(trip.data_inicio)}${trip.data_fim ? " → " + fmtDate(trip.data_fim) : ""}`
    : "";

  const diasHtml = (days ?? []).map((d) => {
    const ats = (d.atividades ?? []).map((a) => {
      const t = ACTIVITY_TYPES[a.tipo] ?? ACTIVITY_TYPES.livre;
      return `
        <div style="display:flex;gap:10px;padding:6px 0;border-top:1px solid #F3F4F6;">
          <div style="width:48px;font-weight:700;color:#1F2937;font-variant-numeric:tabular-nums;">${a.horario ?? "—"}</div>
          <div style="flex:1">
            <div style="font-weight:700;color:#1F2937">${t.icon} ${escapeHtml(a.titulo ?? "")}</div>
            ${a.descricao ? `<div style="color:#4B5563;font-size:12px">${escapeHtml(a.descricao)}</div>` : ""}
            ${a.endereco ? `<div style="color:#6B7280;font-size:11px">📍 ${escapeHtml(a.endereco)}</div>` : ""}
            ${a.preco ? `<div style="color:#92400E;background:#FEF3C7;display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;margin-top:2px;">${escapeHtml(a.preco)}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");
    const hotel = d.hotel ? `<div style="margin-top:8px;padding:8px;background:#F9FAFB;border-radius:8px;font-size:12px;color:#374151;"><strong>🏨 Hotel:</strong> ${escapeHtml(d.hotel)}${d.hotel_endereco ? ` — ${escapeHtml(d.hotel_endereco)}` : ""}</div>` : "";
    return `
      <section style="margin-top:14px;border:1px solid #E5E7EB;border-left:4px solid ${tema.accent};border-radius:10px;padding:12px;">
        <div style="display:flex;align-items:baseline;gap:8px;">
          <div style="font-size:18px;">${d.cover_emoji ?? "🗓️"}</div>
          <div style="font-weight:800;color:${tema.accentDark};font-size:11px;text-transform:uppercase;letter-spacing:0.04em">
            Dia ${d.dia_numero}${d.data ? " · " + fmtDate(d.data) : ""}${d.cidade ? " · " + escapeHtml(d.cidade) : ""}
          </div>
        </div>
        <div style="font-weight:800;font-size:16px;color:#1F2937;margin-top:2px;">${escapeHtml(d.titulo ?? "")}</div>
        ${ats || `<div style="color:#9CA3AF;font-size:12px;padding-top:6px;">Sem atividades.</div>`}
        ${hotel}
      </section>
    `;
  }).join("");

  const contatosHtml = (contatos ?? []).length === 0 ? "" : `
    <section style="margin-top:18px;padding:12px;background:#F9FAFB;border-radius:10px;">
      <div style="font-weight:800;color:${tema.accentDark};font-size:11px;text-transform:uppercase;letter-spacing:0.04em">📇 Contatos</div>
      ${contatos.map((c) => `
        <div style="padding:6px 0;border-top:1px solid #E5E7EB;">
          <div style="font-weight:700;color:#1F2937;">${c.favorito ? "⭐ " : ""}${escapeHtml(c.nome)}</div>
          ${c.telefone ? `<div style="color:#374151;font-size:12px">${escapeHtml(c.telefone)}</div>` : ""}
          ${c.endereco ? `<div style="color:#6B7280;font-size:11px">${escapeHtml(c.endereco)}</div>` : ""}
        </div>
      `).join("")}
    </section>
  `;

  return `
    <div style="font-family: 'DM Sans', system-ui, sans-serif; color: #1F2937; padding: 24px; width: 720px; background: #FFFFFF;">
      <header style="background:${tema.gradient};color:white;border-radius:16px;padding:20px;">
        <div style="font-size:13px;opacity:0.85;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;">Viajjei</div>
        <div style="font-size:26px;font-weight:800;margin-top:4px;display:flex;align-items:center;gap:8px;">
          <span>${trip.cover_emoji ?? "🧳"}</span><span>${escapeHtml(trip.nome ?? "")}</span>
        </div>
        <div style="font-size:13px;opacity:0.92;margin-top:6px;">${escapeHtml(cidades)}</div>
        ${datas ? `<div style="font-size:13px;opacity:0.92;margin-top:2px;">${escapeHtml(datas)}${trip.num_pessoas ? " · " + trip.num_pessoas + " pessoas" : ""}</div>` : ""}
      </header>

      <main>${diasHtml}</main>
      ${contatosHtml}

      <footer style="margin-top:18px;text-align:center;color:#9CA3AF;font-size:11px;">
        Gerado por Viajjei — tripvision-saas.netlify.app
      </footer>
    </div>
  `;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export async function exportRoteiroPdf({ trip, days, contatos = [] }) {
  const tema = getTema(trip.tema);
  const html = buildHtml(trip, days, contatos, tema);

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  try {
    const node = wrapper.firstElementChild;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#FFFFFF", useCORS: true });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    const imgW = A4_W_MM;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= A4_H_MM;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= A4_H_MM;
    }
    const filename = `roteiro-${(trip.slug ?? "viagem")}.pdf`;

    // Try Web Share API with file (mobile); fallback to download
    try {
      const blob = pdf.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: trip.nome, text: "Roteiro da viagem" });
        return;
      }
    } catch { /* fallback */ }

    pdf.save(filename);
  } finally {
    document.body.removeChild(wrapper);
  }
}
