-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R11-5: trocar regex `^\d+$` por `^[0-9]+$` em count_ia_user_messages_*.
-- POSIX padrão é mais robusto contra futuras upgrades de PG ou migração
-- pra outros engines.

CREATE OR REPLACE FUNCTION public.count_ia_user_messages_in_month(uid uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF uid <> auth.uid() AND NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT SUM(cnt)::int FROM (
      SELECT COUNT(*) AS cnt
      FROM public.ia_conversas c,
           LATERAL jsonb_array_elements(c.messages) AS m
      WHERE c.user_id = uid
        AND m->>'role' = 'user'
        AND COALESCE((m->>'_welcome')::boolean, false) = false
        AND CASE
          WHEN (m->>'ts') ~ '^[0-9]+$' THEN to_timestamp(((m->>'ts')::bigint) / 1000.0)
          ELSE NULL
        END >= date_trunc('month', now())
      GROUP BY c.id
    ) s
  ), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.count_ia_user_messages_today(uid uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF uid <> auth.uid() AND NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT SUM(cnt)::int FROM (
      SELECT COUNT(*) AS cnt
      FROM public.ia_conversas c,
           LATERAL jsonb_array_elements(c.messages) AS m
      WHERE c.user_id = uid
        AND m->>'role' = 'user'
        AND COALESCE((m->>'_welcome')::boolean, false) = false
        AND CASE
          WHEN (m->>'ts') ~ '^[0-9]+$' THEN to_timestamp(((m->>'ts')::bigint) / 1000.0)
          ELSE NULL
        END >= date_trunc('day', now())
      GROUP BY c.id
    ) s
  ), 0);
END;
$$;
