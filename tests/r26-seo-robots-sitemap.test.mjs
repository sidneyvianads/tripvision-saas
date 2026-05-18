// Smoke tests R26 — robots.txt + sitemap.xml.
//
// Cobre:
// - Arquivos existem em public/
// - robots.txt tem Allow + Disallows críticos + ref ao sitemap
// - sitemap.xml é XML bem-formado, contém URLs públicas esperadas
// - Vite copia ambos pro build (dist/) — verificado via build prévio.
//
// String-based suficiente: arquivos são puros texto/XML, sem JS.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROBOTS = resolve(__dirname, "../public/robots.txt");
const SITEMAP = resolve(__dirname, "../public/sitemap.xml");

describe("R26-1 — robots.txt", () => {
  it("Arquivo existe", () => {
    expect(existsSync(ROBOTS)).toBe(true);
  });

  const src = existsSync(ROBOTS) ? readFileSync(ROBOTS, "utf8") : "";

  it("User-agent: * + Allow: / na raiz", () => {
    expect(src).toMatch(/^User-agent:\s*\*\s*$/m);
    expect(src).toMatch(/^Allow:\s*\/\s*$/m);
  });

  it("Disallow rotas de auth", () => {
    expect(src).toMatch(/^Disallow:\s*\/welcome\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/aceitar-convite\s*$/m);
  });

  it("Disallow rotas autenticadas (admin, /v/, conta, assinatura)", () => {
    expect(src).toMatch(/^Disallow:\s*\/v\/new\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/v\/\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/conta\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/assinatura\/\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/admin\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/admin\/\s*$/m);
  });

  it("Disallow query strings de tracking (anti-duplicação)", () => {
    expect(src).toMatch(/^Disallow:\s*\/\*\?utm_\*\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/\*\?ref=\*\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/\*\?invite=\*\s*$/m);
    expect(src).toMatch(/^Disallow:\s*\/\*\?cupom=\*\s*$/m);
  });

  it("Referencia sitemap absoluto", () => {
    expect(src).toMatch(/^Sitemap:\s*https:\/\/viajjei\.com\.br\/sitemap\.xml\s*$/m);
  });

  it("NÃO bloqueia /afiliado/ (público, Google descobre via links)", () => {
    expect(src).not.toMatch(/Disallow:\s*\/afiliado/);
  });

  it("NÃO bloqueia /, /precos, /termos, /privacidade", () => {
    // Sanity: nenhum desses paths está em Disallow
    expect(src).not.toMatch(/Disallow:\s*\/precos/);
    expect(src).not.toMatch(/Disallow:\s*\/termos/);
    expect(src).not.toMatch(/Disallow:\s*\/privacidade/);
  });
});

describe("R26-1 — sitemap.xml", () => {
  it("Arquivo existe", () => {
    expect(existsSync(SITEMAP)).toBe(true);
  });

  const src = existsSync(SITEMAP) ? readFileSync(SITEMAP, "utf8") : "";

  it("XML declaration UTF-8", () => {
    expect(src).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it("urlset com schema sitemaps.org/0.9", () => {
    expect(src).toMatch(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    expect(src).toMatch(/<\/urlset>/);
  });

  it("Contém URL canônica '/' priority 1.0", () => {
    const root = src.match(/<url>[\s\S]*?<loc>https:\/\/viajjei\.com\.br\/<\/loc>[\s\S]*?<\/url>/);
    expect(root?.[0]).toBeTruthy();
    expect(root[0]).toMatch(/<priority>1\.0<\/priority>/);
    expect(root[0]).toMatch(/<changefreq>weekly<\/changefreq>/);
  });

  it("Contém /precos com priority 0.9", () => {
    const p = src.match(/<url>[\s\S]*?<loc>[^<]*\/precos<\/loc>[\s\S]*?<\/url>/);
    expect(p?.[0]).toBeTruthy();
    expect(p[0]).toMatch(/<priority>0\.9<\/priority>/);
  });

  it("Contém /termos com priority 0.5", () => {
    const t = src.match(/<url>[\s\S]*?<loc>[^<]*\/termos<\/loc>[\s\S]*?<\/url>/);
    expect(t?.[0]).toBeTruthy();
    expect(t[0]).toMatch(/<priority>0\.5<\/priority>/);
  });

  it("Contém /privacidade com priority 0.5", () => {
    const p = src.match(/<url>[\s\S]*?<loc>[^<]*\/privacidade<\/loc>[\s\S]*?<\/url>/);
    expect(p?.[0]).toBeTruthy();
    expect(p[0]).toMatch(/<priority>0\.5<\/priority>/);
  });

  it("Cada <url> tem <loc>, <lastmod>, <changefreq>, <priority>", () => {
    const urls = src.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    expect(urls.length).toBeGreaterThanOrEqual(4);
    for (const url of urls) {
      expect(url).toMatch(/<loc>https:\/\/viajjei\.com\.br/);
      expect(url).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
      expect(url).toMatch(/<changefreq>\w+<\/changefreq>/);
      expect(url).toMatch(/<priority>[01]?\.\d<\/priority>/);
    }
  });

  it("NÃO inclui rotas autenticadas (consistência com robots.txt)", () => {
    // Anchora em <loc>...</loc> pra não pegar paths mencionados em
    // <!-- comentário --> que documentam quais URLs ficam de fora.
    const locs = (src.match(/<loc>([^<]+)<\/loc>/g) ?? []).join("\n");
    expect(locs).not.toMatch(/\/welcome\b/);
    expect(locs).not.toMatch(/\/conta\b/);
    expect(locs).not.toMatch(/\/aceitar-convite\b/);
    expect(locs).not.toMatch(/\/admin\b/);
    expect(locs).not.toMatch(/\/v\//);
    expect(locs).not.toMatch(/\/assinatura\//);
  });

  it("Todas as URLs usam https:// + dominio absoluto", () => {
    const locs = src.match(/<loc>([^<]+)<\/loc>/g) ?? [];
    expect(locs.length).toBeGreaterThanOrEqual(4);
    for (const loc of locs) {
      expect(loc).toMatch(/<loc>https:\/\/viajjei\.com\.br/);
    }
  });
});

describe("R26 anti-regressão — consistência robots ↔ sitemap", () => {
  const robots = existsSync(ROBOTS) ? readFileSync(ROBOTS, "utf8") : "";
  const sitemap = existsSync(SITEMAP) ? readFileSync(SITEMAP, "utf8") : "";

  it("Rotas no sitemap NÃO aparecem em Disallow do robots", () => {
    // Pra cada <loc> no sitemap, garante que o path correspondente NÃO
    // está em Disallow.
    const paths = (sitemap.match(/<loc>https:\/\/viajjei\.com\.br(\/[^<]*)<\/loc>/g) ?? [])
      .map((m) => m.replace(/.*<loc>https:\/\/viajjei\.com\.br/, "").replace(/<\/loc>$/, ""));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      // Path "/" precisa de regex especial — qualquer "Disallow: /" sozinho seria conflito
      const norm = p === "" ? "/" : p;
      const re = new RegExp(`^Disallow:\\s*${norm.replace(/\//g, "\\/")}\\s*$`, "m");
      expect(robots).not.toMatch(re);
    }
  });
});
