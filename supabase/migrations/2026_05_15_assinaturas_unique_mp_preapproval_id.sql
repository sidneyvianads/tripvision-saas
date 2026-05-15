-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- Aplicada em produção (projeto tripvision-saas, ref mucwvugadqksassosixn).
--
-- webhook-mp.mjs usa UPSERT com on_conflict=mp_preapproval_id mas a tabela
-- nunca teve constraint UNIQUE — cada webhook autorizado criava linha
-- duplicada em assinaturas. Validado sem duplicatas no momento da fix.

CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_mp_preapproval_id_uniq
  ON public.assinaturas(mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;
