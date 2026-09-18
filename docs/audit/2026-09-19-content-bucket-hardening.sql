-- PROPOSED — apply on the live Supabase project after reading the notes.
-- Scope: close the last open CRITICAL from docs/audit/2026-09-18-data-security.md
-- (Finding 5.1) plus two MEDIUM data-integrity items.
--
-- WHY 5.1 IS STILL OPEN
-- The `content` bucket is public=true while it also stores enrollment-gated
-- lesson PDFs/materials. Anyone who learns an object path can fetch it from the
-- unauthenticated public CDN endpoint, which bypasses the storage.objects RLS
-- policy entirely.
--
-- WHY IT CANNOT BE FLIPPED ALONE
-- src/lib/resolveContentUrl.ts serves presentation images (courses/,
-- thumbnails/, hero-banners/, chapter-icons/, banners/) through
-- getPublicUrl(). Those must stay readable for SIGNED-OUT visitors, so the
-- order is: (1) create a dedicated public bucket, (2) copy those five prefixes
-- into it, (3) point resolveContentUrl at the new bucket, (4) only then run
-- step 1 below.

-- ---------------------------------------------------------------------------
-- STEP 0 (do first, via the Storage tool/API, not SQL): create bucket
--   `public-media` with public = true, and copy the five presentation prefixes
--   from `content` into it. Then ship the code change in resolveContentUrl.ts.
-- ---------------------------------------------------------------------------

-- 1) CRITICAL — make the gated bucket private. Run ONLY after step 0 shipped.
UPDATE storage.buckets SET public = false WHERE id = 'content';

-- 2) MEDIUM — DB-level idempotency on the provider's own payment id, in
--    addition to the existing idempotency_key column.
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_payments_payment_id_uidx
  ON public.razorpay_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 3) MEDIUM — tighten the legacy "any authenticated user" SELECT policy on
--    materials so paid-course files need an active enrollment or a staff role.
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
    WHERE c.id = materials.course_id AND c.price = 0
  )
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = materials.course_id
      AND e.status = 'active'
  )
);

-- ---------------------------------------------------------------------------
-- VERIFY ON THE LIVE DB (read-only; run these before and after)
-- ---------------------------------------------------------------------------
-- a) No enrollment INSERT policy may omit the paid-verification check:
--    SELECT policyname, cmd, with_check FROM pg_policies WHERE tablename='enrollments';
-- b) profiles.role must be gone (roles live only in public.user_roles):
--    SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='profiles' AND column_name='role';
-- c) Bucket state:
--    SELECT id, public FROM storage.buckets ORDER BY id;
