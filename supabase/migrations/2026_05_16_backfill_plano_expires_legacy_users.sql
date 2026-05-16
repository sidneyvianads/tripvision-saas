-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R8-5: backfill de plano_expires_at pros 3 clientes legados pre-MP
-- (Michelly, Renata, Victor) antes de apertar hasActiveAccess.
--
-- Sidney (owner) é preservado — owner não usa plano_expires_at.

UPDATE public.users
SET plano_expires_at = NOW() + INTERVAL '365 days'
WHERE plano IN ('pro', 'grupo')
  AND plano_expires_at IS NULL
  AND mp_preapproval_id IS NULL;

-- Resultado esperado:
--   Sidney owner       → plano_expires_at NULL (não tocado)
--   Michelly grupo     → +365d
--   Renata grupo       → +365d
--   Victor grupo       → +365d
--
-- Sidney pode editar essas datas via SQL Editor a qualquer momento.
-- O cron de reconcile não toca neles (filtro mp_preapproval_id NOT NULL).
