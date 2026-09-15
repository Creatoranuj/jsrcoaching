
-- 1) doubt_replies INSERT
DROP POLICY IF EXISTS "Authenticated users can insert replies" ON public.doubt_replies;
CREATE POLICY "Users insert replies into their sessions"
ON public.doubt_replies FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.doubt_sessions ds
      WHERE ds.id = doubt_replies.doubt_session_id
        AND (ds.student_id = auth.uid() OR ds.teacher_id = auth.uid())
    )
  )
);

-- 2) live_messages INSERT
DROP POLICY IF EXISTS "Authenticated users can insert own messages" ON public.live_messages;
CREATE POLICY "Participants and staff insert live messages"
ON public.live_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.live_participants lp
      WHERE lp.session_id = live_messages.session_id AND lp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.live_sessions ls
      JOIN public.enrollments e ON e.course_id = ls.course_id
                                AND e.user_id = auth.uid()
                                AND e.status = 'active'
      WHERE ls.id = live_messages.session_id
    )
  )
);

-- 3) SECURITY DEFINER function exposure (lints 0028 / 0029)
--    Auto-revoke EXECUTE from PUBLIC / anon / authenticated on every
--    SECURITY DEFINER function in public, EXCEPT the ones the client
--    genuinely needs to call.
DO $do$
DECLARE
  r RECORD;
  keep TEXT[] := ARRAY[
    'has_role',
    'get_user_role',
    'get_quiz_questions',
    'get_dashboard_snapshot',
    'get_course_bundle',
    'get_course_lesson_stats',
    'get_platform_stats',
    'search_lectures',
    'user_can_access_live_session_topic',
    'verify_enrollment_for_attendance',
    'increment_book_clicks'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    IF NOT (r.proname = ANY(keep)) THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
        r.proname, r.args
      );
    END IF;
  END LOOP;
END
$do$;

-- 4) pg_graphql exposure (lints 0026 / 0027) — app uses PostgREST.
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
