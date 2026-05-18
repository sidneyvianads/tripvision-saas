-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R23-1: cria ia_conversa_log + trigger + migra count_* pra ler dela.
--
-- Motivação: count_ia_user_messages_in_month/today HOJE faz
-- jsonb_array_elements(messages) — depende do array completo.
-- Truncar messages pra últimas 50 (R23-2/3) zeraria/diminuiria o
-- contador artificialmente → user passaria do limite do plano.
--
-- Estratégia: log table sem content, só metadados (ts/role/welcome).
-- 32 bytes/msg vs 500-2000 do content. 2400 msgs/ano por user = ~80KB.
-- count_* migra pra log. Truncate mexe SÓ no array messages, log preserva.
--
-- Validação backfill: 166 log rows = 166 jsonb_array_length total = 100%
-- cobertura (zero msgs com ts inválido em prod).

CREATE TABLE IF NOT EXISTS public.ia_conversa_log (
  conversa_id uuid NOT NULL REFERENCES public.ia_conversas(id) ON DELETE CASCADE,
  ts_ms bigint NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  is_welcome boolean NOT NULL DEFAULT false,
  ts timestamptz GENERATED ALWAYS AS (to_timestamp(ts_ms / 1000.0)) STORED,
  PRIMARY KEY (conversa_id, ts_ms)
);

CREATE INDEX IF NOT EXISTS ia_conversa_log_user_ts_idx
  ON public.ia_conversa_log (user_id, ts);

CREATE INDEX IF NOT EXISTS ia_conversa_log_user_role_ts_idx
  ON public.ia_conversa_log (user_id, role, ts) WHERE NOT is_welcome;

ALTER TABLE public.ia_conversa_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_conversa_log_select ON public.ia_conversa_log;
CREATE POLICY ia_conversa_log_select ON public.ia_conversa_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Trigger AFTER INSERT/UPDATE: idempotente via ON CONFLICT (PK protege).
CREATE OR REPLACE FUNCTION public.sync_ia_conversa_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.ia_conversa_log (conversa_id, ts_ms, user_id, role, is_welcome)
  SELECT
    NEW.id,
    (m->>'ts')::bigint,
    NEW.user_id,
    COALESCE(m->>'role', 'unknown'),
    COALESCE((m->>'_welcome')::boolean, false)
  FROM jsonb_array_elements(NEW.messages) AS m
  WHERE m->>'ts' ~ '^[0-9]+$'
  ON CONFLICT (conversa_id, ts_ms) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ia_conversas_sync_log ON public.ia_conversas;
CREATE TRIGGER ia_conversas_sync_log
  AFTER INSERT OR UPDATE OF messages ON public.ia_conversas
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ia_conversa_log();

-- Backfill: idempotente via ON CONFLICT.
INSERT INTO public.ia_conversa_log (conversa_id, ts_ms, user_id, role, is_welcome)
SELECT
  c.id,
  (m->>'ts')::bigint,
  c.user_id,
  COALESCE(m->>'role', 'unknown'),
  COALESCE((m->>'_welcome')::boolean, false)
FROM public.ia_conversas c, LATERAL jsonb_array_elements(c.messages) AS m
WHERE m->>'ts' ~ '^[0-9]+$'
ON CONFLICT (conversa_id, ts_ms) DO NOTHING;

-- count_* migradas pra ler da log table.
CREATE OR REPLACE FUNCTION public.count_ia_user_messages_in_month(uid uuid)
RETURNS integer
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
    SELECT COUNT(*)::int FROM public.ia_conversa_log
    WHERE user_id = uid
      AND role = 'user'
      AND NOT is_welcome
      AND ts >= date_trunc('month', now())
  ), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.count_ia_user_messages_today(uid uuid)
RETURNS integer
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
    SELECT COUNT(*)::int FROM public.ia_conversa_log
    WHERE user_id = uid
      AND role = 'user'
      AND NOT is_welcome
      AND ts >= date_trunc('day', now())
  ), 0);
END;
$$;
