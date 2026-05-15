-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- Aplicada em produção (projeto tripvision-saas, ref mucwvugadqksassosixn).
-- Mantido aqui pra histórico/revisão.
--
-- Resolve 3 sangrias críticas da Auditoria Mythos R3:
--   1) afiliados.select_public qual=true → vazava email/total_receita/comissao_pct.
--   2) comissoes.select_public qual=true → vazava todas as comissões.
--   3) users_update_own permitia user mexer em plano → self-promote pra owner.

-- ── afiliados: column-level GRANT ───────────────────────────────────────
REVOKE SELECT ON public.afiliados FROM anon, authenticated;
GRANT SELECT (id, nome, instagram, cupom, ativo, desconto_percent, foto_url, created_at, updated_at)
  ON public.afiliados TO anon, authenticated;

-- ── comissoes: bloqueio total exceto platform_owner ─────────────────────
DROP POLICY IF EXISTS comissoes_select_public ON public.comissoes;
CREATE POLICY comissoes_select_owner ON public.comissoes
  FOR SELECT USING (is_platform_owner());

-- ── users: UPDATE só em colunas seguras ─────────────────────────────────
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (nome, avatar_cor, avatar_url, notifications_on)
  ON public.users TO authenticated;

-- ── users: co-membros podem ver perfil (avatar/nome no chat) ────────────
DROP POLICY IF EXISTS users_select_co_member ON public.users;
CREATE POLICY users_select_co_member ON public.users
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.viagem_membros me
      JOIN public.viagem_membros other ON me.viagem_id = other.viagem_id
      WHERE me.user_id = auth.uid()
        AND other.user_id = users.id
    )
  );

-- NOTA: AdminAfiliados.jsx hoje lê email/total_receita via anon-key client →
-- vai parar de funcionar. Próximo passo: criar RPC SECURITY DEFINER
-- admin_afiliados_list() que só roda pra is_platform_owner. Até lá, Sidney
-- consulta direto no SQL Editor do Supabase.
