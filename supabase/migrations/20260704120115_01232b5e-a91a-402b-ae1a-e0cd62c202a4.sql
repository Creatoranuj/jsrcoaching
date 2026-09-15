
-- 1. Backfill: treat existing NULL prices as free (0). Admins can raise later.
UPDATE public.courses SET price = 0 WHERE price IS NULL;

-- 2. Lock down the column: default 0, NOT NULL. No more silent "free" via NULL.
ALTER TABLE public.courses ALTER COLUMN price SET DEFAULT 0;
ALTER TABLE public.courses ALTER COLUMN price SET NOT NULL;

-- 3. Rewrite the self-enrollment policy: exact match on price = 0 only.
DROP POLICY IF EXISTS "Users can enroll in free courses only" ON public.enrollments;
CREATE POLICY "Users can enroll in free courses only"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_id
      AND courses.price = 0
  )
);
