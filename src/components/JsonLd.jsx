// R27-3: injeta JSON-LD schema.org no <head> via useEffect.
//
// Schema.org JSON-LD é como o Google entende dados estruturados — habilita
// "rich snippets" em search results (preço, rating, sitelinks).
//
// Uso:
//   <JsonLd data={{
//     "@context": "https://schema.org",
//     "@type": "Organization",
//     name: "Viajjei",
//     ...
//   }} />
//
// Pode passar array de objetos pra emitir múltiplos schemas:
//   <JsonLd data={[orgSchema, softwareSchema]} />
//
// Cleanup remove o <script> no unmount — evita pollutar head quando
// usuário navega pra outra rota.

import { useEffect, useId } from "react";

export default function JsonLd({ data }) {
  const id = useId();
  useEffect(() => {
    if (typeof document === "undefined" || !data) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.jsonLdId = id;
    // Array vira lista de schemas; objeto único vira só ele.
    const payload = Array.isArray(data) ? data : [data];
    script.textContent = JSON.stringify(payload.length === 1 ? payload[0] : payload);
    document.head.appendChild(script);
    return () => {
      try { document.head.removeChild(script); } catch { /* já removido */ }
    };
  }, [id, data]);
  return null;
}
