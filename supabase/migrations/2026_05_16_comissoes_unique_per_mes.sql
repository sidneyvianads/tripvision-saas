-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R6-1: UNIQUE composto pra impedir comissão duplicada quando o webhook
-- MP retenta agressivamente em 5xx (acontece sob carga).
--
-- Antes: webhook-mp.mjs fazia SELECT-then-INSERT (não-atômico) em
-- comissoes. 2 webhooks simultâneos → ambos veem SELECT vazio → ambos
-- inserem → afiliado recebe comissão dupla + total_indicados/_receita
-- dobrados em afiliados PATCH.
--
-- Agora: INSERT com Prefer:resolution=ignore-duplicates retorna [] em
-- conflito → o PATCH em afiliados só roda quando a row foi realmente
-- criada (wasInsertedFresh).
--
-- Índice parcial WHERE assinatura_id IS NOT NULL porque o FK é
-- ON DELETE SET NULL — comissões órfãs (user deletou conta) podem
-- existir e duplicar é menos crítico que perder o histórico.

CREATE UNIQUE INDEX IF NOT EXISTS comissoes_unique_per_mes
  ON public.comissoes (afiliado_id, assinatura_id, mes_referencia)
  WHERE assinatura_id IS NOT NULL;
