DO $$
DECLARE
  r record;
  anon_wl text[] := ARRAY[
    'search_lectures',
    'get_platform_stats'
  ];
  auth_wl text[] := ARRAY[
    'search_lectures',
    'get_platform_stats',
    'has_role',
    'get_user_role',
    'get_user_profiles_admin',
    'get_quiz_questions',
    'verify_enrollment_for_attendance',
    'increment_book_clicks',
    'get_course_lesson_stats',
    'get_course_bundle',
    'get_dashboard_snapshot',
    'process_refund',
    'audit_security_policies',
    'match_knowledge',
    'complete_paid_enrollment'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      r.proname, r.args
    );
    IF r.proname = ANY(auth_wl) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        r.proname, r.args
      );
    END IF;
    IF r.proname = ANY(anon_wl) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
        r.proname, r.args
      );
    END IF;
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.proname, r.args
    );
  END LOOP;
END $$;