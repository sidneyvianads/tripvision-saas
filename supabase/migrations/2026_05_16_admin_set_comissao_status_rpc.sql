-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R10-3: RPC pra Sidney marcar comissão como pago após R9-3 REVOKE
-- write em comissoes.

CREATE OR REPLACE FUNCTION public.admin_set_comissao_status(
  p_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pendente', 'pago') THEN
    RAISE EXCEPTION 'status inválido: %', p_status USING ERRCODE = '22023';
  END IF;
  UPDATE public.comissoes SET status = p_status WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_comissao_status(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_comissao_status(uuid, text) TO authenticated;
