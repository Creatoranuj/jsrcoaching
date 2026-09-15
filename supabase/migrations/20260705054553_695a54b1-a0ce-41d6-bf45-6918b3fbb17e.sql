-- 1) Revoke public/anon/authenticated EXECUTE from every SECURITY DEFINER
--    function in the public schema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;

-- 2) Re-grant EXECUTE only to the safe app-facing helpers.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_stats()                                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_book_clicks(uuid)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_admin()                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats()                             TO anon, authenticated;

-- 3) Payment / refund / enrollment completion stay restricted (service_role only).
--    complete_paid_enrollment + process_refund are intentionally NOT re-granted;
--    the razorpay edge functions run as service_role and can still call them.
