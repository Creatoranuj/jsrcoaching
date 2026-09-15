-- Storage RLS policies for the newly created "avatars" bucket.
-- Files are stored under "{user_id}/avatar_*.jpg" (see AvatarUploadModal.tsx).
-- These live in the storage schema (untouched by the public-schema package),
-- so they survive the schema-package rebuild.

-- Public read of avatar images (works once the bucket is set to public).
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

-- Users can upload only into their own {user_id}/ folder.
DROP POLICY IF EXISTS "avatars user insert" ON storage.objects;
CREATE POLICY "avatars user insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can overwrite/update only their own avatar files.
DROP POLICY IF EXISTS "avatars user update" ON storage.objects;
CREATE POLICY "avatars user update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete only their own avatar files.
DROP POLICY IF EXISTS "avatars user delete" ON storage.objects;
CREATE POLICY "avatars user delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);