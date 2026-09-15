
-- 1. Revoke pg_graphql access from client roles (app uses PostgREST only).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='graphql_public') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated, PUBLIC';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA graphql_public FROM anon, authenticated, PUBLIC';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated, PUBLIC';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='graphql') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated, PUBLIC';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated, PUBLIC';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated, PUBLIC';
  END IF;
END $$;

-- 2. Revoke blanket EXECUTE on public functions from anon / PUBLIC / authenticated.
--    We will re-grant explicitly below only on the RPCs the app calls.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      r.proname, r.args
    );
  END LOOP;
END $$;

-- 3. Re-grant EXECUTE to `authenticated` only on the RPCs the app actually calls.
--    All of these are SECURITY DEFINER with internal auth checks + fixed search_path.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_bundle(bigint)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_live_session_topic(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_book_clicks(uuid)                TO authenticated;

-- service_role keeps full access for edge functions (matches default; grant explicitly for clarity).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
