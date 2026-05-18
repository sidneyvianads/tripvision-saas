-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R22-1: bucket 'diario' + RLS policies pra migrar fotos do diário
-- (Base64 inline em JSONB diario.fotos) → URLs públicas do Storage.
--
-- Hoje: 5 fotos × ~150KB Base64 = ~750KB por post. SELECT 200 posts
-- = ~150MB carregados a cada reload do Diario. Real-time channel reenvia
-- post inteiro a cada mudança. Catastrófico no scale.
--
-- Path convention: diario/{viagem_id}/{post_id}/{idx}.{ext}
-- storage.foldername retorna [viagem_id, post_id], index PG 1-based.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diario', 'diario', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "diario_public_read" ON storage.objects;
DROP POLICY IF EXISTS "diario_member_insert" ON storage.objects;
DROP POLICY IF EXISTS "diario_member_update" ON storage.objects;
DROP POLICY IF EXISTS "diario_member_delete" ON storage.objects;

-- SELECT público: URLs com UUIDs longos não-enumeráveis.
CREATE POLICY "diario_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'diario');

-- INSERT/UPDATE: só membro da viagem (foldername[1] = viagem_id UUID).
CREATE POLICY "diario_member_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'diario'
    AND is_member_of(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "diario_member_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'diario'
    AND is_member_of(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'diario'
    AND is_member_of(((storage.foldername(name))[1])::uuid)
  );

-- DELETE: dono da foto (storage.objects.owner = quem fez upload) OU
-- admin da viagem. DB-side já protege via diario table RLS — Storage
-- tem regra própria pra evitar órfãos.
CREATE POLICY "diario_member_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'diario'
    AND (
      auth.uid() = owner
      OR is_admin_of(((storage.foldername(name))[1])::uuid)
    )
  );
