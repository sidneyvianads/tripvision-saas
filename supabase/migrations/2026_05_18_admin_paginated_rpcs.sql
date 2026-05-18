-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R19-2: RPCs paginadas pra AdminAfiliados (3 tabs).
--
-- Retornam JSONB {"rows": [...], "total": N, "page": X, "page_size": Y}
-- pra UI calcular "Página X de Y" + paginar sem segunda query de count.
-- SECURITY DEFINER + guard is_platform_owner.
--
-- Substituem (mantém o admin_afiliados_list antigo como fallback até R19-3+
-- aplicar frontend novo; admin_afiliados_list é o sem-paginação que estava
-- truncando silenciosamente em produção via .limit(500) na UsuariosTab).

CREATE INDEX IF NOT EXISTS afiliados_created_at_idx ON public.afiliados (created_at DESC);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON public.users (created_at DESC);
CREATE INDEX IF NOT EXISTS users_plano_idx ON public.users (plano);
CREATE INDEX IF NOT EXISTS comissoes_status_idx ON public.comissoes (status);
CREATE INDEX IF NOT EXISTS comissoes_created_at_idx ON public.comissoes (created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_afiliados_list_v2(
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 25,
  p_search text DEFAULT NULL,
  p_filter_ativo text DEFAULT 'todos',
  p_sort_col text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_offset int; v_total bigint; v_rows jsonb;
        v_search text; v_sort_col text; v_sort_dir text;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  v_search := COALESCE(lower(trim(p_search)), '');
  v_sort_col := CASE p_sort_col
    WHEN 'nome' THEN 'nome' WHEN 'created_at' THEN 'created_at'
    WHEN 'total_indicados' THEN 'total_indicados' WHEN 'total_receita' THEN 'total_receita'
    ELSE 'created_at' END;
  v_sort_dir := CASE lower(COALESCE(p_sort_dir, 'desc'))
    WHEN 'asc' THEN 'asc' ELSE 'desc' END;
  v_offset := GREATEST(0, (GREATEST(1, p_page) - 1) * GREATEST(1, p_page_size));

  EXECUTE format($q$
    SELECT COUNT(*) FROM public.afiliados a
    WHERE ($1 = '' OR lower(a.nome) LIKE '%%' || $1 || '%%' OR lower(a.cupom) LIKE '%%' || $1 || '%%')
      AND ($2 = 'todos' OR ($2 = 'ativo' AND a.ativo = true) OR ($2 = 'inativo' AND a.ativo = false))
  $q$) INTO v_total USING v_search, p_filter_ativo;

  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
      SELECT a.id, a.nome, a.email, a.instagram, a.cupom,
             a.comissao_percent, a.desconto_percent, a.ativo,
             a.total_indicados, a.total_receita, a.foto_url,
             a.created_at, a.updated_at
      FROM public.afiliados a
      WHERE ($1 = '' OR lower(a.nome) LIKE '%%' || $1 || '%%' OR lower(a.cupom) LIKE '%%' || $1 || '%%')
        AND ($2 = 'todos' OR ($2 = 'ativo' AND a.ativo = true) OR ($2 = 'inativo' AND a.ativo = false))
      ORDER BY %I %s NULLS LAST
      LIMIT $3 OFFSET $4
    ) t
  $q$, v_sort_col, v_sort_dir) INTO v_rows USING v_search, p_filter_ativo, p_page_size, v_offset;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total,
    'page', GREATEST(1, p_page), 'page_size', GREATEST(1, p_page_size));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_users_list(
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 25,
  p_search text DEFAULT NULL,
  p_filter_plano text DEFAULT 'todos',
  p_filter_origem text DEFAULT 'todos',
  p_filter_afiliado uuid DEFAULT NULL,
  p_sort_col text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_offset int; v_total bigint; v_rows jsonb;
        v_search text; v_sort_col text; v_sort_dir text;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  v_search := COALESCE(lower(trim(p_search)), '');
  v_sort_col := CASE p_sort_col
    WHEN 'email' THEN 'email' WHEN 'nome' THEN 'nome'
    WHEN 'plano' THEN 'plano' WHEN 'created_at' THEN 'created_at'
    ELSE 'created_at' END;
  v_sort_dir := CASE lower(COALESCE(p_sort_dir, 'desc'))
    WHEN 'asc' THEN 'asc' ELSE 'desc' END;
  v_offset := GREATEST(0, (GREATEST(1, p_page) - 1) * GREATEST(1, p_page_size));

  EXECUTE format($q$
    SELECT COUNT(*) FROM public.users u
    WHERE ($1 = '' OR lower(u.email) LIKE '%%' || $1 || '%%' OR lower(u.nome) LIKE '%%' || $1 || '%%')
      AND ($2 = 'todos' OR u.plano = $2)
      AND ($3 = 'todos' OR COALESCE(u.origem, 'organico') = $3)
      AND ($4::uuid IS NULL OR u.afiliado_id = $4)
  $q$) INTO v_total USING v_search, p_filter_plano, p_filter_origem, p_filter_afiliado;

  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
      SELECT u.id, u.nome, u.email, u.plano, u.plano_expires_at,
             u.trial_ends_at, u.origem, u.afiliado_id, u.created_at
      FROM public.users u
      WHERE ($1 = '' OR lower(u.email) LIKE '%%' || $1 || '%%' OR lower(u.nome) LIKE '%%' || $1 || '%%')
        AND ($2 = 'todos' OR u.plano = $2)
        AND ($3 = 'todos' OR COALESCE(u.origem, 'organico') = $3)
        AND ($4::uuid IS NULL OR u.afiliado_id = $4)
      ORDER BY %I %s NULLS LAST
      LIMIT $5 OFFSET $6
    ) t
  $q$, v_sort_col, v_sort_dir) INTO v_rows
    USING v_search, p_filter_plano, p_filter_origem, p_filter_afiliado, p_page_size, v_offset;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total,
    'page', GREATEST(1, p_page), 'page_size', GREATEST(1, p_page_size));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_comissoes_list(
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 25,
  p_filter_status text DEFAULT 'todos',
  p_filter_afiliado uuid DEFAULT NULL,
  p_filter_mes text DEFAULT NULL,
  p_sort_col text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_offset int; v_total bigint; v_rows jsonb;
        v_sort_col text; v_sort_dir text;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  v_sort_col := CASE p_sort_col
    WHEN 'valor_comissao' THEN 'valor_comissao' WHEN 'status' THEN 'status'
    WHEN 'mes_referencia' THEN 'mes_referencia' WHEN 'created_at' THEN 'created_at'
    ELSE 'created_at' END;
  v_sort_dir := CASE lower(COALESCE(p_sort_dir, 'desc'))
    WHEN 'asc' THEN 'asc' ELSE 'desc' END;
  v_offset := GREATEST(0, (GREATEST(1, p_page) - 1) * GREATEST(1, p_page_size));

  EXECUTE format($q$
    SELECT COUNT(*) FROM public.comissoes c
    WHERE ($1 = 'todos' OR c.status = $1)
      AND ($2::uuid IS NULL OR c.afiliado_id = $2)
      AND ($3::text IS NULL OR c.mes_referencia = $3)
  $q$) INTO v_total USING p_filter_status, p_filter_afiliado, p_filter_mes;

  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
      SELECT c.id, c.afiliado_id, c.assinatura_id, c.valor_assinatura,
             c.percentual, c.valor_comissao, c.mes_referencia, c.status,
             c.created_at, c.user_email_snapshot, c.plano_snapshot, c.ciclo_snapshot,
             jsonb_build_object('nome', a.nome, 'cupom', a.cupom) AS afiliado
      FROM public.comissoes c
      LEFT JOIN public.afiliados a ON a.id = c.afiliado_id
      WHERE ($1 = 'todos' OR c.status = $1)
        AND ($2::uuid IS NULL OR c.afiliado_id = $2)
        AND ($3::text IS NULL OR c.mes_referencia = $3)
      ORDER BY c.%I %s NULLS LAST
      LIMIT $4 OFFSET $5
    ) t
  $q$, v_sort_col, v_sort_dir) INTO v_rows
    USING p_filter_status, p_filter_afiliado, p_filter_mes, p_page_size, v_offset;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total,
    'page', GREATEST(1, p_page), 'page_size', GREATEST(1, p_page_size));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_afiliados_list_v2(int, int, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_users_list(int, int, text, text, text, uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_comissoes_list(int, int, text, uuid, text, text, text) FROM public;

GRANT EXECUTE ON FUNCTION public.admin_afiliados_list_v2(int, int, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_users_list(int, int, text, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_comissoes_list(int, int, text, uuid, text, text, text) TO authenticated;
