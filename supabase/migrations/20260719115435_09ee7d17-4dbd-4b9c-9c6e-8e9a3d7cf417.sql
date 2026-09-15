
-- 1) Lock privileged payment RPCs to service_role only.
REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.process_refund(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(text) TO service_role;

-- 2) Make get_user_role deterministic (admin > teacher > student).
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'admin'::app_role   THEN 1
    WHEN 'teacher'::app_role THEN 2
    WHEN 'student'::app_role THEN 3
    ELSE 4
  END
  LIMIT 1
$$;

-- 3) Scope comments SELECT to enrolled users / staff / owner / free-course viewers.
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
CREATE POLICY "Enrolled users and staff can view comments"
  ON public.comments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.enrollments e ON e.course_id = l.course_id
      WHERE l.id = comments.lesson_id
        AND e.user_id = auth.uid()
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = comments.lesson_id
        AND (c.price IS NULL OR c.price = 0)
    )
  );

-- 4) Scope timetable SELECT to enrolled users / staff.
DROP POLICY IF EXISTS "Anyone authenticated can view timetable" ON public.timetable;
CREATE POLICY "Enrolled users and staff can view timetable"
  ON public.timetable
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.course_id = timetable.course_id
        AND e.user_id = auth.uid()
        AND e.status = 'active'
    )
  );
