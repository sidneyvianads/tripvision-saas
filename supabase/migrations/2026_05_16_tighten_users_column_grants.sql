-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R7-2: column-grant em public.users — leak de senha_hash + reset_code +
-- stripe_customer_id via co-membros de viagens compartilhadas.
--
-- Bug original: hotfix R3 revogou UPDATE em colunas sensíveis mas
-- esqueceu SELECT. Combinado com users_select_co_member, leak garantido.
--
-- Fix: REVOKE SELECT total + GRANT explícito SÓ em colunas inócuas.

REVOKE SELECT ON public.users FROM anon, authenticated;

GRANT SELECT (
  id, nome, email, avatar_cor, avatar_url,
  plano, plano_expires_at, trial_ends_at,
  origem, afiliado_id, notifications_on, created_at
) ON public.users TO authenticated;

-- anon: sem grant (signUp usa Supabase Auth, profile vem via trigger
-- SECURITY DEFINER — não precisa REST direto).
-- service_role: bypass natural via Supabase admin.

-- Validado pós-migration:
--   SELECT senha_hash FROM users → permission denied ✓
--   SELECT id, nome FROM users WHERE id=auth.uid() → ok ✓
