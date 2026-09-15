
-- 1. lesson_likes: restrict SELECT to the owner (or admins).
DROP POLICY IF EXISTS "Anyone authenticated can view likes" ON public.lesson_likes;

CREATE POLICY "Users view their own likes"
ON public.lesson_likes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2. quizzes: require active enrollment OR free course OR admin/teacher.
DROP POLICY IF EXISTS "Students view published quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Enrolled students view published quizzes" ON public.quizzes;

CREATE POLICY "Enrolled students view published quizzes"
ON public.quizzes
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = quizzes.course_id
        AND (c.price IS NULL OR c.price = 0)
    )
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.course_id = quizzes.course_id
        AND e.status = 'active'
    )
  )
);

-- 3. Revoke EXECUTE on SECURITY DEFINER helpers from anon (nothing here
--    should be callable pre-auth).
REVOKE EXECUTE ON FUNCTION public.purge_expired_phone_otps() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_course_bundle(bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_course_lesson_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_snapshot() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_lectures(text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM anon, PUBLIC;

-- Keep landing-page platform stats callable pre-auth.
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon;

-- 4. Revoke EXECUTE from authenticated on functions that must ONLY run inside
--    edge functions / cron / trigger context (never called from the client).
REVOKE EXECUTE ON FUNCTION public.purge_expired_phone_otps() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_refund(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM authenticated;
