-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R23-2: RPCs pra truncar histórico antigo + dashboard de stats.
--
-- truncate_old_ia_messages(p_keep_last):
--   Pra cada row em ia_conversas com mais que p_keep_last msgs, mantém
--   só as últimas N. NÃO afeta ia_conversa_log (R23-1) — count_in_month
--   continua exato. Retorna stats { rows_processed, messages_removed,
--   bytes_saved, bytes_before, bytes_after, keep_last }.
--
--   Guard: aceita caller=NULL (service_role do cron) OU is_platform_owner.
--   Frontend user normal é bloqueado.
--
-- admin_ia_conversas_stats:
--   Health check pro admin. Strict guard is_platform_owner (não aceita
--   NULL caller pra evitar leak via MCP/scripts genéricos).

CREATE OR REPLACE FUNCTION public.truncate_old_ia_messages(p_keep_last int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep int := GREATEST(1, p_keep_last);
  v_rows_processed int := 0;
  v_messages_removed bigint := 0;
  v_bytes_before bigint := 0;
  v_bytes_after bigint := 0;
BEGIN
  -- service_role (cron) chama com auth.uid() = NULL → passa.
  -- User normal logado → bloqueia.
  -- Owner logado → passa via is_platform_owner.
  IF auth.uid() IS NOT NULL AND NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(pg_column_size(messages)), 0) INTO v_bytes_before
    FROM public.ia_conversas;

  WITH candidates AS (
    SELECT id, messages, jsonb_array_length(messages) AS n
    FROM public.ia_conversas
    WHERE jsonb_array_length(messages) > v_keep
  ),
  truncated AS (
    UPDATE public.ia_conversas c
    SET messages = (
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM (
        SELECT elem, ord
        FROM jsonb_array_elements(cand.messages) WITH ORDINALITY AS arr(elem, ord)
        ORDER BY ord DESC
        LIMIT v_keep
      ) sub
    ),
    updated_at = now()
    FROM candidates cand
    WHERE c.id = cand.id
    RETURNING c.id, cand.n
  )
  SELECT COUNT(*), COALESCE(SUM(n - v_keep), 0) INTO v_rows_processed, v_messages_removed
  FROM truncated;

  SELECT COALESCE(SUM(pg_column_size(messages)), 0) INTO v_bytes_after
    FROM public.ia_conversas;

  RETURN jsonb_build_object(
    'rows_processed', v_rows_processed,
    'messages_removed', v_messages_removed,
    'bytes_saved', GREATEST(0, v_bytes_before - v_bytes_after),
    'bytes_before', v_bytes_before,
    'bytes_after', v_bytes_after,
    'keep_last', v_keep
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ia_conversas_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_rows', (SELECT COUNT(*) FROM public.ia_conversas),
    'total_messages_in_array', (
      SELECT COALESCE(SUM(jsonb_array_length(messages)), 0)
      FROM public.ia_conversas
    ),
    'total_messages_in_log', (SELECT COUNT(*) FROM public.ia_conversa_log),
    'avg_messages_per_row', (
      SELECT ROUND(AVG(jsonb_array_length(messages))::numeric, 2)
      FROM public.ia_conversas
    ),
    'max_messages_per_row', (
      SELECT COALESCE(MAX(jsonb_array_length(messages)), 0)
      FROM public.ia_conversas
    ),
    'total_bytes', (
      SELECT COALESCE(SUM(pg_column_size(messages)), 0)
      FROM public.ia_conversas
    ),
    'rows_over_50', (
      SELECT COUNT(*) FROM public.ia_conversas WHERE jsonb_array_length(messages) > 50
    ),
    'rows_over_100', (
      SELECT COUNT(*) FROM public.ia_conversas WHERE jsonb_array_length(messages) > 100
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.truncate_old_ia_messages(int) FROM public;
REVOKE ALL ON FUNCTION public.admin_ia_conversas_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.truncate_old_ia_messages(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ia_conversas_stats() TO authenticated;
