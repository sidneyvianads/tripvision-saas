-- Snapshot da migration aplicada via Supabase MCP em 2026-05-15.
-- Resolve a "promessa quebrada" do useAuth.signUp:152 — antes o profile só
-- era criado se houvesse session ativa após signUp; com email confirmation
-- ON o UPSERT falhava silenciosamente e o user ficava sem row pra sempre.
--
-- Trigger SECURITY DEFINER no auth.users garante que toda criação de conta
-- produz a row de profile correspondente, com defaults sãos.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (
    id, email, nome, avatar_cor, plano, origem, afiliado_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
      SPLIT_PART(NEW.email, '@', 1)
    ),
    COALESCE(NEW.raw_user_meta_data->>'avatar_cor', '#7CB9E8'),
    'pending',
    COALESCE(NEW.raw_user_meta_data->>'origem', 'organico'),
    NULLIF(NEW.raw_user_meta_data->>'afiliado_id', '')::uuid
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
