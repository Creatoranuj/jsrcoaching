-- Drop the public read policy that bypasses the scoped read policy
DROP POLICY IF EXISTS "Public read comment-images" ON storage.objects;

-- Drop the un-scoped upload policy; the owner-scoped "Users upload own comment-images" policy remains
DROP POLICY IF EXISTS "Auth upload comment-images" ON storage.objects;