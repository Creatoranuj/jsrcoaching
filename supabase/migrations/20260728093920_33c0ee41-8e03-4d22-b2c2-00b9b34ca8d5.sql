-- 1. Drop unused legacy users table containing password hashes (0 rows, no FKs)
DROP TABLE IF EXISTS public.users;

-- 2. comment-images: enforce folder ownership on upload
DROP POLICY IF EXISTS "Users upload own comment-images" ON storage.objects;
CREATE POLICY "Users upload own comment-images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'comment-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users update own comment-images" ON storage.objects;
CREATE POLICY "Users update own comment-images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'comment-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'comment-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 3. Revoke anon EXECUTE on SECURITY DEFINER function (edge function platform-stats replaces it)
REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC, anon;

-- 4. Revoke authenticated EXECUTE on server-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.n(text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.n(text, uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) TO service_role;