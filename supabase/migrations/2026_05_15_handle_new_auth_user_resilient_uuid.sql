-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- Hotfix R4: trigger handle_new_auth_user abortava signUp quando
-- raw_user_meta_data.afiliado_id vinha como string inválida (não-UUID).
-- ::uuid lançava 22P02 → INSERT em auth.users abortava → signUp falhava
-- pro user inteiro. Reproduzido: SELECT 'lixo'::uuid retorna erro 22P02.
--
-- Fix:
-- 1) FK users.afiliado_id → afiliados(id) ON DELETE SET NULL.
-- 2) Trigger envolve cast em BEGIN/EXCEPTION pra capturar 22P02.
-- 3) Catch-all final pra não-fatal: qualquer outra exception loga
--    WARNING e retorna NEW (não aborta auth.users).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_afiliado_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_afiliado_id_fkey
      FOREIGN KEY (afiliado_id) REFERENCES public.afiliados(id) ON DELETE SET NULL;
  END IF;
END $$;

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

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_auth_user falhou (não-fatal): %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
