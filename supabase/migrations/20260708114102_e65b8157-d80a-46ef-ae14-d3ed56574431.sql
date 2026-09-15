-- Drop the legacy permissive INSERT policy on storage.objects for comment-images.
-- A folder-scoped policy ("Users upload to own comment-images folder") already exists
-- and enforces (storage.foldername(name))[1] = auth.uid()::text.
DROP POLICY IF EXISTS "Auth users upload comment-images" ON storage.objects;