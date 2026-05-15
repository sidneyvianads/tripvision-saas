-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- Hotfix R4: AdminAfiliados.jsx ficou quebrado depois do hotfix R3 porque
-- a coluna `email` foi revogada de authenticated (column-grant) pra
-- proteger AfiliadoPainel público. SELECT * passou a retornar
-- "permission denied for table afiliados".
--
-- Solução: RPC SECURITY DEFINER com guard is_platform_owner() interno.
-- AdminAfiliados.jsx chama supabase.rpc("admin_afiliados_list") em vez
-- de hit direto na tabela.

CREATE OR REPLACE FUNCTION public.admin_afiliados_list()
RETURNS TABLE (
  id uuid, nome text, email text, instagram text, cupom text,
  comissao_percent numeric, desconto_percent numeric, ativo boolean,
  total_indicados integer, total_receita numeric, foto_url text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.id, a.nome, a.email, a.instagram, a.cupom,
         a.comissao_percent, a.desconto_percent, a.ativo,
         a.total_indicados, a.total_receita, a.foto_url,
         a.created_at, a.updated_at
  FROM public.afiliados a
  ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_afiliados_list() TO authenticated;
