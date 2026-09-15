-- Drop the insecure open INSERT policy
DROP POLICY IF EXISTS "Users can insert own enrollments" ON public.enrollments;

-- Allow self-enrollment only for free courses
CREATE POLICY "Users can enroll in free courses only"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_id
    AND (courses.price IS NULL OR courses.price = 0)
  )
);