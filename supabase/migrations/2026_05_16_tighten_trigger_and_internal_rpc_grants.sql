-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R9-2: REVOKE EXECUTE em 3 SECURITY DEFINER funcs que estavam
-- expostas via REST sem necessidade.

REVOKE EXECUTE ON FUNCTION public.add_owner_as_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_ia_user_messages_in_month(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_ia_user_messages_today(uuid) FROM PUBLIC, anon, authenticated;

-- Validado pós-migration: grantees = postgres, service_role (apenas).
