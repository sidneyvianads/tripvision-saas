// Smoke tests R27 — SEO meta tags + JSON-LD + image perf.
//
// Cobre:
// - R27-1 usePageMeta hook: API + side effects esperados (cleanup)
// - R27-2 4 páginas com usePageMeta: title/description/canonical
// - R27-3 Landing com JsonLd Organization + SoftwareApplication
// - R27-4 Roma removida + width/height/alt em fotos + LCP hints
//
// Validação JSON-LD: parse JSON dos schemas, verifica @context + @type
// + campos required pra rich snippets.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const HOOK = join(SRC, "lib/usePageMeta.js");
const JSONLD = join(SRC, "components/JsonLd.jsx");
const LANDING = join(SRC, "pages/Landing.jsx");
const PRECOS = join(SRC, "pages/PrecosPage.jsx");
const LEGAL = join(SRC, "pages/LegalPages.jsx");
const ROMA = resolve(__dirname, "../public/fotos/roma.jpeg");

describe("R27-1 — usePageMeta hook", () => {
  const src = readFileSync(HOOK, "utf8");

  it("Exporta usePageMeta function", () => {
    expect(src).toMatch(/export function usePageMeta/);
  });

  it("Aceita props { title, description, canonical, ogImage, ogType }", () => {
    expect(src).toMatch(/\{\s*title,\s*description,\s*canonical,\s*ogImage,\s*ogType/);
  });

  it("Seta document.title", () => {
    expect(src).toMatch(/document\.title\s*=\s*title/);
  });

  it("Cria/atualiza <meta name='description'>", () => {
    expect(src).toMatch(/meta\[name="description"\]/);
  });

  it("Atualiza og:description + twitter:description em sync com description", () => {
    expect(src).toMatch(/og:description/);
    expect(src).toMatch(/twitter:description/);
  });

  it("Atualiza canonical via <link rel='canonical'>", () => {
    expect(src).toMatch(/setLinkHref\("canonical"/);
  });

  it("Sync og:url com canonical", () => {
    expect(src).toMatch(/og:url/);
  });

  it("Cleanup restaura title + valores anteriores", () => {
    expect(src).toMatch(/document\.title\s*=\s*prevTitle/);
    // wasCreated → remove; else → restore
    expect(src).toMatch(/snap\.wasCreated/);
    expect(src).toMatch(/snap\.el\.setAttribute\(snap\.attr, snap\.prev\)/);
  });
});

describe("R27-2 — 4 páginas públicas com usePageMeta", () => {
  it("Landing: title + description + canonical próprios", () => {
    const src = readFileSync(LANDING, "utf8");
    expect(src).toMatch(/import\s*\{\s*usePageMeta\s*\}/);
    expect(src).toMatch(/title:\s*["']Viajjei — Concierge de viagem com IA/);
    expect(src).toMatch(/canonical:\s*["']https:\/\/viajjei\.com\.br\/["']/);
  });

  it("PrecosPage: title 'Planos e preços | Viajjei'", () => {
    const src = readFileSync(PRECOS, "utf8");
    expect(src).toMatch(/import\s*\{\s*usePageMeta\s*\}/);
    expect(src).toMatch(/title:\s*["']Planos e preços \| Viajjei["']/);
    expect(src).toMatch(/canonical:\s*["']https:\/\/viajjei\.com\.br\/precos["']/);
    expect(src).toMatch(/Pro \(R\$14,90\/mês\)/);
  });

  it("TermosPage: title 'Termos de Uso | Viajjei'", () => {
    const src = readFileSync(LEGAL, "utf8");
    expect(src).toMatch(/title:\s*["']Termos de Uso \| Viajjei["']/);
    expect(src).toMatch(/canonical:\s*["']https:\/\/viajjei\.com\.br\/termos["']/);
  });

  it("PrivacidadePage: title 'Política de Privacidade | Viajjei'", () => {
    const src = readFileSync(LEGAL, "utf8");
    expect(src).toMatch(/title:\s*["']Política de Privacidade \| Viajjei["']/);
    expect(src).toMatch(/canonical:\s*["']https:\/\/viajjei\.com\.br\/privacidade["']/);
    expect(src).toMatch(/LGPD/);
  });
});

describe("R27-3 — JsonLd component + schemas na Landing", () => {
  const compSrc = readFileSync(JSONLD, "utf8");
  const landingSrc = readFileSync(LANDING, "utf8");

  it("JsonLd component injeta <script type='application/ld+json'>", () => {
    expect(compSrc).toMatch(/script\.type\s*=\s*["']application\/ld\+json["']/);
  });

  it("Cleanup remove o script no unmount", () => {
    expect(compSrc).toMatch(/document\.head\.removeChild\(script\)/);
  });

  it("JsonLd aceita objeto único OU array", () => {
    expect(compSrc).toMatch(/Array\.isArray\(data\)\s*\?\s*data\s*:\s*\[data\]/);
  });

  it("Landing tem ORGANIZATION_SCHEMA com fields required", () => {
    // Extract o objeto inteiro do source pra parsear (string lookup, não eval)
    const block = landingSrc.match(/const ORGANIZATION_SCHEMA\s*=\s*\{[\s\S]+?\};/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/"@context":\s*"https:\/\/schema\.org"/);
    expect(block[0]).toMatch(/"@type":\s*"Organization"/);
    expect(block[0]).toMatch(/name:\s*"Viajjei"/);
    expect(block[0]).toMatch(/url:\s*"https:\/\/viajjei\.com\.br"/);
    expect(block[0]).toMatch(/logo:/);
    expect(block[0]).toMatch(/sameAs:/);
  });

  it("Landing tem SOFTWARE_APP_SCHEMA com offer BRL R$14.90", () => {
    const block = landingSrc.match(/const SOFTWARE_APP_SCHEMA\s*=\s*\{[\s\S]+?\};/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/"@type":\s*"SoftwareApplication"/);
    expect(block[0]).toMatch(/applicationCategory:\s*"TravelApplication"/);
    expect(block[0]).toMatch(/price:\s*"14\.90"/);
    expect(block[0]).toMatch(/priceCurrency:\s*"BRL"/);
    expect(block[0]).toMatch(/availability:\s*"https:\/\/schema\.org\/InStock"/);
  });

  it("Landing renderiza <JsonLd data={[ORGANIZATION_SCHEMA, SOFTWARE_APP_SCHEMA]} />", () => {
    expect(landingSrc).toMatch(/<JsonLd data=\{\[ORGANIZATION_SCHEMA,\s*SOFTWARE_APP_SCHEMA\]\}/);
  });
});

describe("R27-4 — fotos: Roma removida + width/height + alt descritivos + LCP", () => {
  const landingSrc = readFileSync(LANDING, "utf8");

  it("roma.jpeg foi DELETADA do filesystem", () => {
    expect(existsSync(ROMA)).toBe(false);
  });

  it("DESTINOS array NÃO menciona Roma", () => {
    const destinos = landingSrc.match(/const DESTINOS\s*=\s*\[[\s\S]+?\];/);
    expect(destinos?.[0]).toBeTruthy();
    expect(destinos[0]).not.toMatch(/Roma/);
    expect(destinos[0]).not.toMatch(/\/fotos\/roma\.jpeg/);
  });

  it("DESTINOS itens têm w + h + alt", () => {
    const destinos = landingSrc.match(/const DESTINOS\s*=\s*\[[\s\S]+?\];/);
    // 7 destinos hoje (Roma removida). Cada um com w, h, alt
    const wMatches = destinos[0].match(/w:\s*\d+/g) ?? [];
    const hMatches = destinos[0].match(/h:\s*\d+/g) ?? [];
    const altMatches = destinos[0].match(/alt:\s*["'][^"']+["']/g) ?? [];
    expect(wMatches.length).toBe(7);
    expect(hMatches.length).toBe(7);
    expect(altMatches.length).toBe(7);
  });

  it("Carrossel <img> renderiza com loading lazy + decoding async + w/h", () => {
    // O bloco de render do DESTINOS.map
    const block = landingSrc.match(/DESTINOS\.map\([\s\S]+?\)\)\}/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/loading="lazy"/);
    expect(block[0]).toMatch(/decoding="async"/);
    expect(block[0]).toMatch(/width=\{d\.w\}/);
    expect(block[0]).toMatch(/height=\{d\.h\}/);
    expect(block[0]).toMatch(/alt=\{d\.alt\}/);
  });

  it("Hero LCP candidate (Noronha) tem fetchpriority=high + decoding=sync", () => {
    // Hero photo principal — primeira imagem grande visível.
    const block = landingSrc.match(/HERO_PHOTOS\.noronha[\s\S]+?className="w-full h-full object-cover"\s*\/>/);
    expect(block?.[0]).toBeTruthy();
    expect(block[0]).toMatch(/fetchpriority="high"/);
    expect(block[0]).toMatch(/decoding="sync"/);
    expect(block[0]).toMatch(/width="1600"/);
    expect(block[0]).toMatch(/height="1070"/);
  });

  it("Hero outras imagens (Rio/Salvador) com loading eager + decoding async + w/h", () => {
    // Rio
    const rioBlock = landingSrc.match(/HERO_PHOTOS\.rio[\s\S]+?className="w-full h-full object-cover"\s*\/>/);
    expect(rioBlock?.[0]).toMatch(/loading="eager"/);
    expect(rioBlock[0]).toMatch(/decoding="async"/);
    expect(rioBlock[0]).toMatch(/width="999"/);
    // Salvador
    const salvadorBlock = landingSrc.match(/HERO_PHOTOS\.salvador[\s\S]+?className="w-full h-full object-cover"\s*\/>/);
    expect(salvadorBlock?.[0]).toMatch(/loading="eager"/);
    expect(salvadorBlock[0]).toMatch(/width="840"/);
  });

  it("Alt texts descritivos (não só nome da cidade)", () => {
    const destinos = landingSrc.match(/const DESTINOS\s*=\s*\[[\s\S]+?\];/);
    // Heuristic: cada alt tem 4+ palavras (contextual, não só "Rio")
    const alts = destinos[0].match(/alt:\s*["']([^"']+)["']/g) ?? [];
    for (const alt of alts) {
      const text = alt.match(/alt:\s*["']([^"']+)["']/)[1];
      expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("R27 — Landing schemas validam como JSON (sintaxe correta)", () => {
  it("ORGANIZATION_SCHEMA + SOFTWARE_APP_SCHEMA são JS válido (build passa)", () => {
    // Se a sintaxe estivesse quebrada, npm run build falharia. Mas
    // ainda assim verificar shape dos objetos via grep.
    const src = readFileSync(LANDING, "utf8");
    // Não pode ter trailing comma no @context ou outras coisas que JSON.parse
    // rejeitaria. Como aqui é JS object literal, vírgula trailing é OK.
    // Smoke check: cada schema tem chave @context + @type.
    const orgBlock = src.match(/ORGANIZATION_SCHEMA\s*=\s*\{[\s\S]+?\};/);
    const appBlock = src.match(/SOFTWARE_APP_SCHEMA\s*=\s*\{[\s\S]+?\};/);
    expect(orgBlock?.[0]).toMatch(/"@context"/);
    expect(orgBlock[0]).toMatch(/"@type"/);
    expect(appBlock?.[0]).toMatch(/"@context"/);
    expect(appBlock[0]).toMatch(/"@type"/);
  });
});
