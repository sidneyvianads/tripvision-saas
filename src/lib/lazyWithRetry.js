import { lazy } from "react";

// Wrapper de React.lazy que sobrevive a ChunkLoadError após deploy.
//
// Problema (R10-7): Vite produz chunks com hash no nome (ex:
// AdminAfiliados-abc123.js). Deploy novo gera hashes diferentes. Se o
// user ficou com o app aberto há horas/dias e clica numa rota lazy
// (/admin/afiliados, /conta, /v/:slug etc), o browser tenta carregar
// o chunk OLD que não existe mais → 404 → ChunkLoadError → ErrorBoundary
// mostra tela "Algo deu errado".
//
// Estratégia: 1 retry imediato (caso seja network blip transient),
// depois reload da página (puxa o index.html novo + chunks novos).
// O reload preserva o caminho atual via window.location.href intacto.
export function lazyWithRetry(importFn) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (e) {
      // Detecta ChunkLoadError (e.name) ou TypeError com mensagem
      // específica do Vite/Webpack.
      const msg = String(e?.message ?? e);
      const isChunkError =
        e?.name === "ChunkLoadError" ||
        /Loading chunk \d+ failed/i.test(msg) ||
        /failed to fetch dynamically imported module/i.test(msg) ||
        /Importing a module script failed/i.test(msg);

      if (!isChunkError) throw e;

      // Tenta 1× mais — pode ser blip transient
      try {
        return await importFn();
      } catch {
        // Falhou de novo: provavelmente deploy mudou os hashes.
        // Force reload pra puxar o index.html novo.
        if (typeof window !== "undefined") {
          window.location.reload();
        }
        // Re-throw pro ErrorBoundary mostrar a tela enquanto o reload acontece.
        throw e;
      }
    }
  });
}
