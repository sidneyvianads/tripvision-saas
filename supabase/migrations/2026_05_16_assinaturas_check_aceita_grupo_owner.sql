-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R10-1: CHECK constraint só aceitava 'pro'. Plano 'grupo' pago via
-- MP → 23514 violation → 500 → MP reentrega 24h → user nunca ativado.
-- Bug latente desde a criação da tabela (0 grupo subs ainda).

ALTER TABLE public.assinaturas DROP CONSTRAINT IF EXISTS assinaturas_plano_check;
ALTER TABLE public.assinaturas ADD CONSTRAINT assinaturas_plano_check
  CHECK (plano IN ('pro', 'grupo', 'owner'));
