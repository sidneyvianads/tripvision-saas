-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- Hotfix R5-1: get_afiliado_panel usava `cupom ILIKE p_cupom` — atacante
-- anônimo passava '%' e enumerava afiliados (nome/instagram/comissão/
-- agregados de receita) via wildcard ILIKE.
--
-- Confirmado em produção: SELECT get_afiliado_panel('%') retornava o
-- primeiro afiliado ativo (Taynara). Iterando wildcards a lista inteira
-- vazava em segundos.
--
-- Fix: igualdade case-insensitive normalizada (TRIM+UPPER em ambos os
-- lados) — sem ILIKE, sem interpretação de %_.

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
  v_cupom text;
BEGIN
  v_cupom := UPPER(TRIM(COALESCE(p_cupom, '')));
  IF v_cupom = '' THEN
    RETURN NULL;
  END IF;

  SELECT id, nome, cupom, instagram, desconto_percent, comissao_percent, ativo, foto_url, created_at
    INTO v_afiliado
    FROM public.afiliados
    WHERE UPPER(cupom) = v_cupom AND ativo = true
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
