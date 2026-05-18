-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R21-1: bucket 'avatars' + RLS policies pra migrar Base64 inline → Storage.
--
-- Bug raiz que motiva R21: hoje users.avatar_url armazena ~270KB de
-- Base64 inline. Cada SELECT em users (Avatar component em People,
-- Diario, useChat, etc) carrega isso → bandwidth + cache miss.
-- Não escala — 1 user só hoje (Sidney) mas vai virar problema rápido.
--
-- Padrão correto: Storage com URL pública. Bucket público porque
-- avatars são públicos por design (quem vê o profile, vê a foto).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true, 2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;

-- Público leitura: qualquer pessoa baixa a URL.
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Escrita: só logado, e só no folder com meu UUID.
-- storage.foldername('avatars/{uid}/avatar.webp') → ['{uid}','avatar.webp']
-- Index [1] em PG é 1-based — pega o folder UUID.
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
