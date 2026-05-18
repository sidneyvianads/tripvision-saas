// R27-1: hook pra setar meta tags por rota sem dep externa.
// Substitui react-helmet-async (~5KB) por useEffect direto.
//
// Uso:
//   usePageMeta({
//     title: "Planos e preços | Viajjei",
//     description: "Pro R$14,90/mês. 7 dias grátis.",
//     canonical: "https://viajjei.com.br/precos",
//     ogImage: "https://viajjei.com.br/og-precos.png",  // opcional
//   });
//
// O hook:
// - Substitui <title> + <meta name="description"> + <link rel="canonical">
// - Sobrescreve og:title, og:description, og:url, og:image (cria se não existir)
// - Sobrescreve twitter:title/description/image
// - No unmount, restaura valores antes de montar (importante: usuário pode
//   navegar pra outra rota; sem cleanup o título da rota anterior ficava)
//
// Limitação conhecida: como roda em useEffect (depois do render), crawlers
// que só leem o HTML inicial (não-JS bots tipo Twitter, WhatsApp preview)
// continuam vendo o que está em /index.html. Solução completa exigiria
// SSR/SSG — fora de escopo. Para esses bots, og.mjs edge function já
// reescreve em /v/{slug} (R5-4); outras rotas usam fallback do
// index.html que já tem og default decente.

import { useEffect } from "react";

// Cache de "valor original" por nome de tag, pra restaurar no cleanup.
function getOrCreateMeta(selector, createFn) {
  let el = document.querySelector(selector);
  if (!el && createFn) {
    el = createFn();
    document.head.appendChild(el);
  }
  return el;
}

function setMetaContent(selector, content, createFn) {
  if (content == null) return null;
  const el = getOrCreateMeta(selector, createFn);
  if (!el) return null;
  const prev = el.getAttribute("content");
  el.setAttribute("content", content);
  return { el, prev };
}

function setLinkHref(rel, href) {
  if (href == null) return null;
  const sel = `link[rel="${rel}"]`;
  let el = document.querySelector(sel);
  const wasCreated = !el;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute("href");
  el.setAttribute("href", href);
  return { el, prev, wasCreated };
}

export function usePageMeta({ title, description, canonical, ogImage, ogType = "website" } = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Title
    const prevTitle = document.title;
    if (title) document.title = title;

    // Snapshots pra restaurar no cleanup. Array de { el, prev } por meta.
    const snapshots = [];

    if (description != null) {
      const snap = setMetaContent('meta[name="description"]', description, () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        return m;
      });
      if (snap) snapshots.push({ ...snap, attr: "content" });

      // og:description + twitter:description seguem description por padrão
      const ogDescSnap = setMetaContent('meta[property="og:description"]', description, () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:description");
        return m;
      });
      if (ogDescSnap) snapshots.push({ ...ogDescSnap, attr: "content" });

      const twDescSnap = setMetaContent('meta[name="twitter:description"]', description, () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:description");
        return m;
      });
      if (twDescSnap) snapshots.push({ ...twDescSnap, attr: "content" });
    }

    if (title) {
      const ogTitleSnap = setMetaContent('meta[property="og:title"]', title, () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:title");
        return m;
      });
      if (ogTitleSnap) snapshots.push({ ...ogTitleSnap, attr: "content" });

      const twTitleSnap = setMetaContent('meta[name="twitter:title"]', title, () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:title");
        return m;
      });
      if (twTitleSnap) snapshots.push({ ...twTitleSnap, attr: "content" });
    }

    if (canonical) {
      const linkSnap = setLinkHref("canonical", canonical);
      if (linkSnap) snapshots.push({ ...linkSnap, attr: "href" });

      // og:url segue canonical
      const ogUrlSnap = setMetaContent('meta[property="og:url"]', canonical, () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:url");
        return m;
      });
      if (ogUrlSnap) snapshots.push({ ...ogUrlSnap, attr: "content" });
    }

    if (ogImage) {
      const imgSnap = setMetaContent('meta[property="og:image"]', ogImage, null);
      if (imgSnap) snapshots.push({ ...imgSnap, attr: "content" });

      const twImgSnap = setMetaContent('meta[name="twitter:image"]', ogImage, null);
      if (twImgSnap) snapshots.push({ ...twImgSnap, attr: "content" });
    }

    if (ogType) {
      const typeSnap = setMetaContent('meta[property="og:type"]', ogType, null);
      if (typeSnap) snapshots.push({ ...typeSnap, attr: "content" });
    }

    return () => {
      // Restaura no unmount (user navega pra outra rota).
      document.title = prevTitle;
      for (const snap of snapshots) {
        if (snap.wasCreated) {
          // criamos a tag — remove
          snap.el.remove();
        } else if (snap.prev != null) {
          snap.el.setAttribute(snap.attr, snap.prev);
        }
      }
    };
  // Strings primitivas — deps simples. Component que muda meta por
  // navigation re-execute o effect (cleanup + setup).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, canonical, ogImage, ogType]);
}
