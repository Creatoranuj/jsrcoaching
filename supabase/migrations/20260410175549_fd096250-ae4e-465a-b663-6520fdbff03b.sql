
-- ============================================================
-- FIX #1: Remove session_token column (leaked credential)
-- ============================================================
ALTER TABLE public.user_sessions DROP COLUMN IF EXISTS session_token;

-- ============================================================
-- FIX #2: Secure quiz questions — RPC without correct_answer
-- ============================================================
DROP VIEW IF EXISTS public.questions_for_students;

CREATE OR REPLACE FUNCTION public.get_quiz_questions(_quiz_id uuid)
RETURNS TABLE(
  id uuid,
  quiz_id uuid,
  question_text text,
  question_type text,
  options jsonb,
  marks integer,
  negative_marks integer,
  order_index integer,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.quiz_id, q.question_text, q.question_type,
         q.options, q.marks, q.negative_marks, q.order_index, q.image_url
  FROM public.questions q
  WHERE q.quiz_id = _quiz_id
  ORDER BY q.order_index;
$$;

-- ============================================================
-- FIX #3: Storage bucket policies for enrolled students
-- ============================================================
CREATE POLICY "Enrolled students can view course videos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.user_id = auth.uid()
        AND enrollments.status = 'active'
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

CREATE POLICY "Enrolled students can view course materials"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.user_id = auth.uid()
        AND enrollments.status = 'active'
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

-- Admin/teacher full access to storage buckets
CREATE POLICY "Staff can manage course videos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'course-videos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

CREATE POLICY "Staff can manage course materials"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'course-materials'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);
