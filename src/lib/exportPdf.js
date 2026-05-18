// R24-2: export do roteiro pra PDF via pdf-lib.
//
// Antes: html2canvas + jsPDF. Render do DOM via screenshot rasterizado.
//   - Bundle: ~604KB (jsPDF ~200 + html2canvas ~200 + chunk wrapper)
//   - PDF resultante: 500KB-2MB (JPEG q=0.85, dependendo do roteiro)
//   - Texto NÃO selecionável (era imagem)
//   - Ctrl+F dentro do PDF nada acha
//   - A11y zero (screen reader não lê)
//
// Agora: pdf-lib vetorial puro.
//   - Bundle: ~100KB (pdf-lib only)
//   - PDF resultante: 30-80KB típico
//   - Texto selecionável + Ctrl+F funciona
//   - Helvetica built-in (sem embed de font)
//   - Logo PNG embedado uma vez (~5KB)
//
// Layout A4 portrait:
//   - Margem 50pt em volta
//   - Header roxo do brand com nome + cidades + datas
//   - Por dia: faixa accent + título + atividades (horário/título/desc/endereço/preço) + hotel
//   - Quebra de página automática quando passa do rodapé
//   - Footer numérico em cada página

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PageSizes,
} from "pdf-lib";
import { getTema } from "../data/themes";

// ─── constantes A4 + layout ──────────────────────────────────────────
const [PAGE_W, PAGE_H] = PageSizes.A4;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 28;
const PAGE_BOTTOM = MARGIN + FOOTER_H;

// Cores reutilizadas (rgb 0-1).
const C_TEXT      = rgb(0.118, 0.157, 0.220); // #1F2937
const C_SUBTLE    = rgb(0.420, 0.447, 0.502); // #6B7280
const C_HINT      = rgb(0.612, 0.639, 0.686); // #9CA3AF
const C_LINE      = rgb(0.898, 0.906, 0.922); // #E5E7EB
const C_BG_HOTEL  = rgb(0.976, 0.980, 0.984); // #F9FAFB
const C_BG_PRICE  = rgb(0.996, 0.953, 0.780); // #FEF3C7
const C_PRICE     = rgb(0.573, 0.255, 0.055); // #92400E

// ─── helpers ─────────────────────────────────────────────────────────
const fmtDateBR = (iso) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" })
      .format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
};

function describePessoasPdf(trip) {
  const ad = Number(trip.adultos ?? 0);
  const cr = Number(trip.criancas ?? 0);
  const be = Number(trip.bebes ?? 0);
  const parts = [];
  if (ad > 0) parts.push(`${ad} ${ad === 1 ? "adulto" : "adultos"}`);
  if (cr > 0) parts.push(`${cr} ${cr === 1 ? "criança" : "crianças"}`);
  if (be > 0) parts.push(`${be} ${be === 1 ? "bebê" : "bebês"}`);
  if (parts.length) return parts.join(", ");
  return trip.num_pessoas ? `${trip.num_pessoas} pessoas` : null;
}

// Helvetica não tem glyph pra emoji nem certos chars high-Unicode.
// Sanitiza removendo o que não cabe em WinAnsi (encoding default).
// Mantém PT-BR (á, ç, etc — todos em WinAnsi).
function sanitize(s) {
  if (s == null) return "";
  // Replace common emoji-like control chars + remove anything fora do
  // range BMP que pdf-lib não consegue codificar com Helvetica.
  return String(s)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")  // emoji ranges
    .replace(/[\u{2600}-\u{27BF}]/gu, "")    // misc symbols + dingbats
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")  // pictographs
    .replace(/[️‍]/g, "")          // variation selectors + ZWJ
    .replace(/\s+/g, " ")
    .trim();
}

// Quebra texto em N linhas máximo respeitando largura. pdf-lib não tem
// wrap nativo — implementamos via measurement por char.
function wrapText(font, text, fontSize, maxWidth, maxLines = Infinity) {
  const clean = sanitize(text);
  if (!clean) return [];
  const words = clean.split(" ");
  const lines = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Se ainda passou do maxLines mid-loop, trunca e adiciona ellipsis.
  if (lines.length >= maxLines) {
    const last = lines[maxLines - 1];
    // Reservar espaço pro "…" no final
    const ell = "…";
    if (font.widthOfTextAtSize(last + ell, fontSize) > maxWidth) {
      // Trim words até caber
      const ws = last.split(" ");
      let trunc = "";
      for (const w of ws) {
        const cand = trunc ? `${trunc} ${w}` : w;
        if (font.widthOfTextAtSize(cand + ell, fontSize) > maxWidth) break;
        trunc = cand;
      }
      lines[maxLines - 1] = (trunc || "") + ell;
    } else {
      lines[maxLines - 1] = last + ell;
    }
  }
  return lines;
}

// ─── classe que gerencia páginas + cursor de Y ──────────────────────
class PdfBuilder {
  constructor(pdf, fonts, accent, accentDark) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.accent = accent;
    this.accentDark = accentDark;
    this.page = null;
    this.y = 0;
    this.pageIdx = 0;
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.pageIdx++;
    return this.page;
  }

  ensureSpace(needed) {
    if (this.y - needed < PAGE_BOTTOM) {
      this.newPage();
    }
  }

  // Desenha texto multiline, retorna altura consumida.
  drawTextBlock(text, { font, size, color, x, maxWidth, lineHeight, maxLines }) {
    const lines = wrapText(font, text, size, maxWidth ?? CONTENT_W, maxLines);
    const lh = lineHeight ?? size * 1.3;
    let yLocal = this.y;
    for (const line of lines) {
      this.ensureSpace(lh);
      this.page.drawText(line, { x: x ?? MARGIN, y: this.y - size, size, font, color });
      this.y -= lh;
      yLocal = this.y;
    }
    return yLocal;
  }

  // Header gradient simulado: retângulo accent + texto branco.
  drawHeader({ logoImg, trip, cidades, datas, pessoasTxt }) {
    const headerH = 120;
    this.ensureSpace(headerH + 10);
    // Background accent
    this.page.drawRectangle({
      x: MARGIN, y: this.y - headerH,
      width: CONTENT_W, height: headerH,
      color: this.accent,
    });

    // Logo no canto direito
    if (logoImg) {
      const logoW = 70;
      const logoH = (logoImg.height * logoW) / logoImg.width;
      this.page.drawImage(logoImg, {
        x: MARGIN + CONTENT_W - logoW - 18,
        y: this.y - headerH + (headerH - logoH) / 2,
        width: logoW,
        height: logoH,
      });
    }

    // "VIAJJEI" pequena no topo
    this.page.drawText("VIAJJEI", {
      x: MARGIN + 18,
      y: this.y - 26,
      size: 9,
      font: this.fonts.bold,
      color: rgb(1, 1, 1),
      // tracking simulado via espaço — pdf-lib não tem letter-spacing nativo
    });

    // Nome da viagem (sanitiza pra remover emoji que veio do cover_emoji)
    const nome = sanitize(trip.nome) || "Viagem";
    const nomeSize = 22;
    const nomeLines = wrapText(this.fonts.bold, nome, nomeSize, CONTENT_W - 100 /* reserva pro logo */, 1);
    if (nomeLines[0]) {
      this.page.drawText(nomeLines[0], {
        x: MARGIN + 18, y: this.y - 52,
        size: nomeSize, font: this.fonts.bold, color: rgb(1, 1, 1),
      });
    }

    // Cidades
    const cidadesClean = sanitize(cidades);
    if (cidadesClean) {
      const cLines = wrapText(this.fonts.regular, cidadesClean, 11, CONTENT_W - 100, 1);
      this.page.drawText(cLines[0], {
        x: MARGIN + 18, y: this.y - 76,
        size: 11, font: this.fonts.regular, color: rgb(0.95, 0.95, 0.95),
      });
    }

    // Datas + pessoas
    const meta = [datas, pessoasTxt, trip.viaje_segura ? "Viaje Segura" : null]
      .filter(Boolean)
      .map(sanitize)
      .filter(Boolean)
      .join(" · ");
    if (meta) {
      const mLines = wrapText(this.fonts.regular, meta, 10, CONTENT_W - 100, 1);
      this.page.drawText(mLines[0], {
        x: MARGIN + 18, y: this.y - 94,
        size: 10, font: this.fonts.regular, color: rgb(0.9, 0.9, 0.9),
      });
    }

    this.y -= headerH + 16;
  }

  // Faixa "DIA X" + título do dia
  drawDayHeader(day) {
    const headerH = 36;
    this.ensureSpace(headerH + 6);
    // Faixa lateral accent (4pt wide)
    this.page.drawRectangle({
      x: MARGIN, y: this.y - headerH,
      width: 4, height: headerH,
      color: this.accent,
    });
    // Label "DIA X · data · cidade"
    const parts = [`Dia ${day.dia_numero ?? "?"}`];
    if (day.data) parts.push(fmtDateBR(day.data));
    if (day.cidade) parts.push(sanitize(day.cidade));
    const label = parts.join(" · ");
    this.page.drawText(label, {
      x: MARGIN + 12, y: this.y - 14,
      size: 9, font: this.fonts.bold, color: this.accentDark,
    });
    // Título do dia
    const titulo = sanitize(day.titulo) || "Sem título";
    const titleLines = wrapText(this.fonts.bold, titulo, 13, CONTENT_W - 12, 2);
    let yTitulo = this.y - 30;
    for (const line of titleLines) {
      this.page.drawText(line, {
        x: MARGIN + 12, y: yTitulo,
        size: 13, font: this.fonts.bold, color: C_TEXT,
      });
      yTitulo -= 16;
    }
    this.y -= headerH + 6;
    // Ajusta se título tinha 2 linhas
    if (titleLines.length > 1) this.y -= 14;
  }

  // Atividade individual: horário 48pt fixo + bloco texto à direita
  drawActivity(a) {
    const titulo = sanitize(a.titulo) || "Atividade";
    const desc = sanitize(a.descricao);
    const endereco = sanitize(a.endereco);
    const preco = sanitize(a.preco);
    const horario = sanitize(a.horario) || "—";

    // Pré-calcula altura necessária
    const tLines = wrapText(this.fonts.bold, titulo, 11, CONTENT_W - 60, 2);
    const dLines = desc ? wrapText(this.fonts.regular, desc, 10, CONTENT_W - 60, 3) : [];
    const eLines = endereco ? wrapText(this.fonts.regular, endereco, 9, CONTENT_W - 60, 1) : [];
    const hasPreco = !!preco;

    const blockH =
      tLines.length * 14 +
      dLines.length * 13 +
      eLines.length * 12 +
      (hasPreco ? 18 : 0) +
      14; // padding

    this.ensureSpace(blockH);

    // Linha divisória superior
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end:   { x: MARGIN + CONTENT_W, y: this.y },
      thickness: 0.5,
      color: C_LINE,
    });
    this.y -= 8;

    const blockX = MARGIN + 56;
    // Horário
    this.page.drawText(horario, {
      x: MARGIN, y: this.y - 11,
      size: 11, font: this.fonts.bold, color: C_TEXT,
    });
    // Título
    let yLocal = this.y - 11;
    for (const line of tLines) {
      this.page.drawText(line, {
        x: blockX, y: yLocal,
        size: 11, font: this.fonts.bold, color: C_TEXT,
      });
      yLocal -= 14;
    }
    // Descrição
    for (const line of dLines) {
      this.page.drawText(line, {
        x: blockX, y: yLocal,
        size: 10, font: this.fonts.regular, color: C_SUBTLE,
      });
      yLocal -= 13;
    }
    // Endereço
    for (const line of eLines) {
      this.page.drawText(line, {
        x: blockX, y: yLocal,
        size: 9, font: this.fonts.regular, color: C_HINT,
      });
      yLocal -= 12;
    }
    // Preço (badge)
    if (hasPreco) {
      const priceText = `R$ ${preco}`;
      const w = this.fonts.bold.widthOfTextAtSize(priceText, 9) + 10;
      this.page.drawRectangle({
        x: blockX, y: yLocal - 13,
        width: w, height: 14,
        color: C_BG_PRICE,
      });
      this.page.drawText(priceText, {
        x: blockX + 5, y: yLocal - 10,
        size: 9, font: this.fonts.bold, color: C_PRICE,
      });
      yLocal -= 18;
    }
    this.y = yLocal - 4;
  }

  drawHotel(d) {
    const text = `Hotel: ${sanitize(d.hotel)}${d.hotel_endereco ? ` — ${sanitize(d.hotel_endereco)}` : ""}`;
    const lines = wrapText(this.fonts.regular, text, 10, CONTENT_W - 16, 2);
    const blockH = lines.length * 13 + 12;
    this.ensureSpace(blockH);
    this.page.drawRectangle({
      x: MARGIN, y: this.y - blockH,
      width: CONTENT_W, height: blockH,
      color: C_BG_HOTEL,
      borderColor: C_LINE,
      borderWidth: 0.5,
    });
    let yLocal = this.y - 14;
    for (const line of lines) {
      // primeira linha bold em "Hotel:"
      this.page.drawText(line, {
        x: MARGIN + 8, y: yLocal,
        size: 10, font: this.fonts.regular, color: C_TEXT,
      });
      yLocal -= 13;
    }
    this.y -= blockH + 6;
  }

  drawContatos(contatos) {
    if (!contatos?.length) return;
    this.ensureSpace(40);
    this.page.drawText("CONTATOS", {
      x: MARGIN, y: this.y - 11,
      size: 11, font: this.fonts.bold, color: this.accentDark,
    });
    this.y -= 20;
    for (const c of contatos) {
      const nome = sanitize(c.nome);
      if (!nome) continue;
      const tel = sanitize(c.telefone);
      const end = sanitize(c.endereco);
      this.ensureSpace(40);
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: MARGIN + CONTENT_W, y: this.y },
        thickness: 0.5, color: C_LINE,
      });
      this.y -= 4;
      this.page.drawText((c.favorito ? "* " : "") + nome, {
        x: MARGIN, y: this.y - 11,
        size: 11, font: this.fonts.bold, color: C_TEXT,
      });
      let yLocal = this.y - 24;
      if (tel) {
        this.page.drawText(tel, {
          x: MARGIN, y: yLocal,
          size: 10, font: this.fonts.regular, color: C_SUBTLE,
        });
        yLocal -= 12;
      }
      if (end) {
        const eLines = wrapText(this.fonts.regular, end, 9, CONTENT_W, 1);
        if (eLines[0]) {
          this.page.drawText(eLines[0], {
            x: MARGIN, y: yLocal,
            size: 9, font: this.fonts.regular, color: C_HINT,
          });
          yLocal -= 12;
        }
      }
      this.y = yLocal - 4;
    }
  }

  // Footer com paginação. Chamar APÓS terminar todo conteúdo,
  // iterando todas as páginas.
  drawFooters() {
    const total = this.pdf.getPageCount();
    for (let i = 0; i < total; i++) {
      const page = this.pdf.getPage(i);
      const text = `Gerado por Viajjei · viajjei.com.br · pág ${i + 1} de ${total}`;
      const size = 8;
      const w = this.fonts.regular.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (PAGE_W - w) / 2, y: MARGIN / 2,
        size, font: this.fonts.regular, color: C_HINT,
      });
    }
  }
}

// ─── conversão de cor hex → rgb 0-1 ──────────────────────────────────
function hexToRgb01(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex ?? "");
  if (!m) return rgb(0.486, 0.106, 0.561); // fallback roxo brand
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

async function fetchLogoPng() {
  // Logo PNG no /public é servido pelo Netlify/Vite no mesmo origin.
  // Em dev `/logo-viajjei.png` resolve direto; em prod idem.
  try {
    const res = await fetch("/logo-viajjei.png");
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// ─── API pública (mesma assinatura da versão html2canvas) ───────────
export async function exportRoteiroPdf({ trip, days, contatos = [] }) {
  const tema = getTema(trip.tema);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Roteiro Viajjei — ${trip.nome ?? "Viagem"}`);
  pdf.setAuthor("Viajjei");
  pdf.setSubject("Roteiro de viagem");
  pdf.setKeywords(["roteiro", "viagem", "viajjei", trip.slug ?? ""].filter(Boolean));

  const [regular, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);

  const accent = hexToRgb01(tema.accent);
  const accentDark = hexToRgb01(tema.accentDark);

  // Logo PNG embedado (~5KB no PDF, mas reusado em qualquer página).
  const logoBytes = await fetchLogoPng();
  const logoImg = logoBytes ? await pdf.embedPng(logoBytes).catch(() => null) : null;

  const builder = new PdfBuilder(pdf, { regular, bold }, accent, accentDark);

  const cidades = (trip.cidades ?? []).join(" · ") || "";
  const datas = trip.data_inicio
    ? `${fmtDateBR(trip.data_inicio)}${trip.data_fim ? " — " + fmtDateBR(trip.data_fim) : ""}`
    : "";
  const pessoasTxt = describePessoasPdf(trip);
  builder.drawHeader({ logoImg, trip, cidades, datas, pessoasTxt });

  // Roteiro dia por dia
  for (const day of days ?? []) {
    builder.drawDayHeader(day);
    const atividades = day.atividades ?? [];
    if (atividades.length === 0) {
      builder.ensureSpace(20);
      builder.page.drawText("Sem atividades.", {
        x: MARGIN, y: builder.y - 11,
        size: 10, font: regular, color: C_HINT,
      });
      builder.y -= 18;
    } else {
      for (const a of atividades) builder.drawActivity(a);
    }
    if (day.hotel) builder.drawHotel(day);
    builder.y -= 10;
  }

  // Contatos opcional
  if (contatos?.length) {
    builder.y -= 8;
    builder.drawContatos(contatos);
  }

  builder.drawFooters();

  const pdfBytes = await pdf.save();
  const filename = `roteiro-${(trip.slug ?? "viagem")}-${new Date().toISOString().slice(0, 10)}.pdf`;

  // Tenta Web Share API com File (mobile); fallback download via anchor.
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  try {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (typeof navigator !== "undefined"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: trip.nome, text: "Roteiro da viagem" });
      return;
    }
  } catch { /* fallback */ }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
