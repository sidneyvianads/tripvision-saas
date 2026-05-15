-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- R5-2: REVOKE EXECUTE de PUBLIC nas 3 RPCs criadas em R4.
--
-- Postgres default: função plpgsql sem REVOKE explícito ganha EXECUTE
-- pra PUBLIC. Como PUBLIC inclui anon, admin_afiliados_list ficou
-- chamável por qualquer um (guard interno is_platform_owner ainda
-- protegia, mas ampliava superfície de fuzzing).
--
-- Princípio aplicado: menor privilégio.

REVOKE EXECUTE ON FUNCTION public.admin_afiliados_list() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_afiliados_list() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_afiliado_panel(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_afiliado_panel(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
-- (postgres + service_role mantêm acesso pra trigger AFTER INSERT
-- em auth.users continuar funcionando)
