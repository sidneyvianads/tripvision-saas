-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- Hotfix R4: AfiliadoPainel público vazava total_receita.
--
-- 1) Cria RPC SECURITY DEFINER get_afiliado_panel(p_cupom) retornando só
--    agregados desse afiliado específico (sem total_receita global).
-- 2) Aperta o column-grant em afiliados (remove total_receita/_indicados
--    da lista pública — agora só accessible via RPC ou service-role).

CREATE OR REPLACE FUNCTION public.get_afiliado_panel(p_cupom text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afiliado record;
  v_indicados integer;
  v_comissoes jsonb;
BEGIN
  SELECT id, nome, cupom, instagram, desconto_percent, comissao_percent, ativo, foto_url, created_at
    INTO v_afiliado
    FROM public.afiliados
    WHERE cupom ILIKE p_cupom AND ativo = true
    LIMIT 1;

  IF v_afiliado.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_indicados
    FROM public.users
    WHERE afiliado_id = v_afiliado.id;

  SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.mes DESC)
    INTO v_comissoes
    FROM (
      SELECT
        mes_referencia AS mes,
        count(*) AS count,
        sum(valor_comissao) FILTER (WHERE status = 'pago') AS pago,
        sum(valor_comissao) FILTER (WHERE status != 'pago') AS pendente,
        sum(valor_comissao) AS total
      FROM public.comissoes
      WHERE afiliado_id = v_afiliado.id
      GROUP BY mes_referencia
    ) t;

  RETURN jsonb_build_object(
    'afiliado', jsonb_build_object(
      'id', v_afiliado.id, 'nome', v_afiliado.nome, 'cupom', v_afiliado.cupom,
      'instagram', v_afiliado.instagram, 'desconto_percent', v_afiliado.desconto_percent,
      'comissao_percent', v_afiliado.comissao_percent, 'ativo', v_afiliado.ativo,
      'foto_url', v_afiliado.foto_url
    ),
    'indicados_ativos', v_indicados,
    'comissoes_por_mes', COALESCE(v_comissoes, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_afiliado_panel(text) TO anon, authenticated;

-- Aperta o column-grant: total_receita/total_indicados saem da lista pública.
REVOKE SELECT ON public.afiliados FROM anon, authenticated;
GRANT SELECT (id, nome, instagram, cupom, ativo, desconto_percent, foto_url, created_at, updated_at)
  ON public.afiliados TO anon, authenticated;
