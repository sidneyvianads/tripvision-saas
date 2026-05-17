-- Snapshot da migration aplicada via Supabase MCP em 2026-05-16.
-- R9-3: defesa em profundidade — REVOKE table-level + RPC pra admin.

REVOKE INSERT, UPDATE, DELETE ON public.comissoes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.afiliados FROM anon, authenticated;

-- RPC pra Sidney continuar editando afiliados via AdminAfiliados.jsx
-- (REVOKE acima bloqueia client direto, mesmo pra owner — RLS é
-- avaliada DEPOIS de grants table-level).
CREATE OR REPLACE FUNCTION public.admin_upsert_afiliado(
  p_id uuid DEFAULT NULL,
  p_nome text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_cupom text DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_comissao_percent numeric DEFAULT 5,
  p_desconto_percent numeric DEFAULT 0,
  p_ativo boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.afiliados (
      nome, email, instagram, cupom, foto_url,
      comissao_percent, desconto_percent, ativo
    )
    VALUES (
      TRIM(p_nome), LOWER(TRIM(p_email)), NULLIF(TRIM(p_instagram), ''),
      UPPER(TRIM(p_cupom)), NULLIF(TRIM(p_foto_url), ''),
      COALESCE(p_comissao_percent, 5), COALESCE(p_desconto_percent, 0),
      COALESCE(p_ativo, true)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.afiliados SET
      nome = TRIM(p_nome),
      email = LOWER(TRIM(p_email)),
      instagram = NULLIF(TRIM(p_instagram), ''),
      cupom = UPPER(TRIM(p_cupom)),
      foto_url = NULLIF(TRIM(p_foto_url), ''),
      comissao_percent = COALESCE(p_comissao_percent, 5),
      desconto_percent = COALESCE(p_desconto_percent, 0),
      ativo = COALESCE(p_ativo, true),
      updated_at = now()
    WHERE id = p_id;
    v_id := p_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_afiliado(uuid, text, text, text, text, text, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_afiliado(uuid, text, text, text, text, text, numeric, numeric, boolean) TO authenticated;
