-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R28-5: coluna version pra optimistic concurrency em ia_conversas.
--
-- Problema: useIaConversa.persist() fazia UPSERT do array messages
-- inteiro. Em 2 abas abertas (mobile + desktop), última a chegar
-- sobrescreve. Mensagens da outra aba são silenciosamente perdidas.
--
-- Estratégia: optimistic locking via coluna version.
-- - Client lê (messages, version) ao mount.
-- - Persist: UPDATE WHERE version = current_version, SET version+1.
-- - affected_rows = 0 → outra aba já atualizou; client recarrega e
--   re-tenta com merge.

ALTER TABLE public.ia_conversas
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
