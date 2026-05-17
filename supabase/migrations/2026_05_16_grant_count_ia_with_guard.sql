-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R10-2: PlanChat client-side chama count_ia_user_messages_in_month
-- pra sincronizar contador mensal. R9-2 revogou EXECUTE pra
-- authenticated. Resultado: contador IA quebrado pra users pagos.
--
-- Fix: adicionar guard `uid = auth.uid() OR is_platform_owner()`
-- antes do GRANT (defesa em profundidade: antes a função aceitava
-- uid arbitrário, agora só sobre o user logado ou pro owner).

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
          WHEN (m->>'ts') ~ '^\d+$' THEN to_timestamp(((m->>'ts')::bigint) / 1000.0)
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
          WHEN (m->>'ts') ~ '^\d+$' THEN to_timestamp(((m->>'ts')::bigint) / 1000.0)
          ELSE NULL
        END >= date_trunc('day', now())
      GROUP BY c.id
    ) s
  ), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_ia_user_messages_in_month(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_ia_user_messages_today(uuid) TO authenticated;
