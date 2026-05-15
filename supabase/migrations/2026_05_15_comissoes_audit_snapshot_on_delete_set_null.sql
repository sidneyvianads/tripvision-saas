-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- LGPD: preserva audit trail de comissões quando user deleta conta.

ALTER TABLE public.comissoes
  ADD COLUMN IF NOT EXISTS user_email_snapshot text,
  ADD COLUMN IF NOT EXISTS plano_snapshot text,
  ADD COLUMN IF NOT EXISTS ciclo_snapshot text;

ALTER TABLE public.comissoes
  ALTER COLUMN assinatura_id DROP NOT NULL;

ALTER TABLE public.comissoes
  DROP CONSTRAINT IF EXISTS comissoes_assinatura_id_fkey;
ALTER TABLE public.comissoes
  ADD CONSTRAINT comissoes_assinatura_id_fkey
  FOREIGN KEY (assinatura_id)
  REFERENCES public.assinaturas(id)
  ON DELETE SET NULL;
