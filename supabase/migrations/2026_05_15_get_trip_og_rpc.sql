-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- R5-4: RPC SECURITY DEFINER pra Open Graph image preview.
--
-- Antes: edge function og.mjs usava SUPABASE_SERVICE_KEY como fallback
-- de ANON_KEY. SERVICE_KEY no edge bypassava RLS → preview de
-- WhatsApp/Twitter retornava nome+cidades+datas de viagens privadas.
--
-- Fix: RPC retorna só 7 campos seguros (sem owner_id, sem descricao,
-- sem dados sensíveis). og.mjs agora chama essa RPC com ANON_KEY.

CREATE OR REPLACE FUNCTION public.get_trip_og(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trip record;
BEGIN
  IF p_slug IS NULL OR LENGTH(TRIM(p_slug)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT nome, cidades, data_inicio, data_fim, num_pessoas, cover_emoji, tema
    INTO v_trip
    FROM public.viagens
    WHERE slug = TRIM(p_slug)
    LIMIT 1;

  IF v_trip.nome IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'nome', v_trip.nome,
    'cidades', v_trip.cidades,
    'data_inicio', v_trip.data_inicio,
    'data_fim', v_trip.data_fim,
    'num_pessoas', v_trip.num_pessoas,
    'cover_emoji', v_trip.cover_emoji,
    'tema', v_trip.tema
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_trip_og(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_trip_og(text) TO anon, authenticated;
