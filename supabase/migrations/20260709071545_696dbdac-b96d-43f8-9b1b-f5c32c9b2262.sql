-- =========================================================================
-- Sadguru Coaching Classes — anon-surface sweep (2026-07-09)
-- Revokes anon privileges that shouldn't exist; keeps landing-page reads.
-- =========================================================================

-- 1. Revoke anon writes on internal / audit tables ------------------------
REVOKE INSERT, UPDATE, DELETE ON public.dependency_scan_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.lesson_video_meta       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events          FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pdf_proxy_metrics       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles_public         FROM anon;

-- 2. Revoke anon SELECT on tables the landing page does NOT need ---------
REVOKE SELECT ON public.dependency_scan_reports FROM anon;
REVOKE SELECT ON public.lesson_video_meta       FROM anon;
REVOKE SELECT ON public.payment_events          FROM anon;
REVOKE SELECT ON public.pdf_proxy_metrics       FROM anon;
REVOKE SELECT ON public.chatbot_settings        FROM anon;
REVOKE SELECT ON public.knowledge_base          FROM anon;

-- (authenticated + service_role grants left intact — RLS still governs rows)

-- 3. Storage: stop anonymous filename enumeration on public buckets -------
--    Files stay reachable via /storage/v1/object/public/<bucket>/<path>
--    because those requests use the bucket.public flag, not this SELECT
--    policy. Listing (.list()) hits SELECT, so scoping it to authenticated
--    kills enumeration while preserving direct-URL reads.

DROP POLICY IF EXISTS "Anyone can view book covers"    ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view content"        ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view notices files"  ON storage.objects;

CREATE POLICY "Authenticated can list book-covers"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'book-covers');

CREATE POLICY "Authenticated can list content"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'content');

CREATE POLICY "Authenticated can list notices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notices');
