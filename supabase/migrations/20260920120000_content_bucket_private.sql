-- Close the last open storage loophole: the `content` bucket holds BOTH
-- presentation images (course cards, thumbnails, hero banners, chapter icons,
-- banners) and enrollment-gated study material (lessons, materials, notes,
-- quiz images). While `public = true`, anyone who learns an object path can
-- fetch a gated PDF from the unauthenticated CDN endpoint, bypassing
-- storage.objects RLS entirely.
--
-- PRECONDITION ALREADY SHIPPED IN CODE:
-- src/lib/resolveContentUrl.ts no longer calls getPublicUrl() for ANY content
-- path — presentation folders are signed exactly like gated files. So flipping
-- the bucket private does not break signed-out course cards, as long as the
-- `content_presentation_read` policy below grants anon SELECT on the five
-- presentation prefixes (signing requires a SELECT grant on the object).

-- 1) CRITICAL — gated bucket must not be publicly readable.
UPDATE storage.buckets SET public = false WHERE id = 'content';

-- 2) Presentation prefixes stay readable (incl. signed-out visitors) so course
--    cards and banners can be signed. No gated prefix is listed here.
DROP POLICY IF EXISTS "content_presentation_read" ON storage.objects;
CREATE POLICY "content_presentation_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'content'
  AND (storage.foldername(name))[1] IN (
    'courses', 'thumbnails', 'hero-banners', 'chapter-icons', 'banners'
  )
);

-- 3) DB-level idempotency on the provider's own payment id, on top of the
--    existing idempotency_key column — a replayed Razorpay payment can never
--    create a second row.
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_payments_payment_id_uidx
  ON public.razorpay_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 4) Tighten the legacy "any authenticated user" SELECT policy on materials so
--    paid-course files need an active enrollment or a staff role.
DROP POLICY IF EXISTS "Authenticated users can view materials" ON public.materials;
DROP POLICY IF EXISTS "Enrolled users or staff can view materials" ON public.materials;
CREATE POLICY "Enrolled users or staff can view materials"
ON public.materials FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR course_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = materials.course_id AND c.price = 0
  )
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = materials.course_id
      AND e.status = 'active'
  )
);
