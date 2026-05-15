-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- R5-7: refina trigger handle_new_auth_user pra capturar exceções
-- ESPECÍFICAS em vez do catch-all WHEN OTHERS.
--
-- Antes: WHEN OTHERS THEN RAISE WARNING + RETURN NEW silenciava
-- qualquer problema (FK violation, NOT NULL, unique violation, etc) →
-- auth.users criado SEM public.users → user fantasma loga e tem
-- loadProfile=null em loop.
--
-- Agora:
-- - invalid_text_representation (UUID inválido) → vira NULL silenciosamente
-- - foreign_key_violation (afiliado_id deletado entre captureCupom e
--   signUp) → retry com afiliado_id=NULL, user é criado
-- - outras exceções → propagam → signUp falha COM erro útil

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afiliado_id uuid;
  v_afiliado_raw text;
BEGIN
  v_afiliado_raw := NULLIF(TRIM(NEW.raw_user_meta_data->>'afiliado_id'), '');
  IF v_afiliado_raw IS NOT NULL THEN
    BEGIN
      v_afiliado_id := v_afiliado_raw::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_afiliado_id := NULL;
      RAISE NOTICE 'handle_new_auth_user: afiliado_id inválido ignorado: %', v_afiliado_raw;
    END;
  END IF;

  BEGIN
    INSERT INTO public.users (id, email, nome, avatar_cor, plano, origem, afiliado_id)
    VALUES (
      NEW.id, NEW.email,
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''), SPLIT_PART(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'avatar_cor', '#7CB9E8'),
      'pending',
      COALESCE(NEW.raw_user_meta_data->>'origem', 'organico'),
      v_afiliado_id
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'handle_new_auth_user: FK afiliado violada, retry sem afiliado_id';
    INSERT INTO public.users (id, email, nome, avatar_cor, plano, origem, afiliado_id)
    VALUES (
      NEW.id, NEW.email,
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''), SPLIT_PART(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'avatar_cor', '#7CB9E8'),
      'pending',
      COALESCE(NEW.raw_user_meta_data->>'origem', 'organico'),
      NULL
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$;
