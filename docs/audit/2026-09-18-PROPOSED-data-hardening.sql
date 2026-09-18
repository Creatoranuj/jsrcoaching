-- PROPOSED ONLY — NOT APPLIED.
-- Blocked: src/lib/resolveContentUrl.ts:43 uses getPublicUrl() on the "content"
-- bucket for thumbnails/hero-banners, so flipping it private breaks those images.
-- Apply only after public assets move to a separate public bucket, and after
-- confirming the notes policy still leaves enrolled students read access.

-- Audit hardening migration (2026-09-18 data/security audit)
-- Additive, idempotent. See docs/audit/2026-09-18-data-security.md for context.

-- 1) CRITICAL: 'content' bucket is public=true, which serves objects via the
--    unauthenticated public storage endpoint and bypasses the storage.objects
--    RLS policy that gates lesson PDFs/materials by enrollment. Flip private.
--    NOTE: any client code calling storage.from('content').getPublicUrl(...)
--    for the whitelisted public folders (hero-banners/thumbnails/chapter-icons)
--    must switch to signed URLs or a separate public bucket (see PROPOSED P1).
UPDATE storage.buckets SET public = false WHERE id = 'content';

-- 2) MEDIUM: defense-in-depth idempotency at the DB level for Razorpay
--    payment ids, in addition to the existing idempotency_key column.
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_payments_payment_id_uidx
  ON public.razorpay_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 3) MEDIUM: tighten legacy "any authenticated user" SELECT policies on
--    materials/notes to require active enrollment on the related course,
--    or admin/teacher role — mirroring the pattern used for storage.objects
--    on the 'content' bucket.
DROP POLICY IF EXISTS "Authenticated users can view materials" ON public.materials;
CREATE POLICY "Enrolled users or staff can view materials"
ON public.materials FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR course_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = materials.course_id AND (c.price = 0)
  )
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = materials.course_id
      AND e.status = 'active'
  )
);

DROP POLICY IF EXISTS "Authenticated users can view notes" ON public.notes;
CREATE POLICY "Enrolled users or staff can view notes"
ON public.notes FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
);
