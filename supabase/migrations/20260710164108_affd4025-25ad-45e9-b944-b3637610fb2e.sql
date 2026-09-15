
-- 1. Tighten audit_log & error_logs INSERT policies (audit_log_spoof)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
CREATE POLICY "System can insert audit logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users insert error logs" ON public.error_logs;
CREATE POLICY "Authenticated users insert error logs" ON public.error_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND user_id = auth.uid()
    AND (length(COALESCE(message, '')) BETWEEN 1 AND 5000)
    AND (length(COALESCE(stack_trace, '')) <= 20000)
    AND (length(COALESCE(url, '')) <= 2000)
    AND (length(COALESCE(user_agent, '')) <= 1000)
  );

-- 2. live_session_realtime_bypass — enrollment-scope live-session channels
DROP POLICY IF EXISTS "Authenticated can broadcast on allowed channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can read allowed channels" ON realtime.messages;

CREATE OR REPLACE FUNCTION public.user_can_access_live_session_topic(_topic text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    LEFT JOIN public.courses c ON c.id = ls.course_id
    WHERE ls.id::text = split_part(_topic, ':', 2)
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'teacher'::app_role)
        OR ls.course_id IS NULL
        OR (c.price IS NULL OR c.price = 0)
        OR EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.user_id = auth.uid()
            AND e.course_id = ls.course_id
            AND e.status = 'active'
        )
      )
  );
$$;

CREATE POLICY "Authenticated can read allowed channels"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    (realtime.topic() LIKE 'live-session:%' AND public.user_can_access_live_session_topic(realtime.topic()))
    OR (realtime.topic() LIKE 'doubt-session:%' AND EXISTS (
      SELECT 1 FROM public.doubt_sessions ds
      WHERE ds.id::text = split_part(realtime.topic(), ':', 2)
        AND (ds.student_id = auth.uid() OR ds.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    ))
  );

CREATE POLICY "Authenticated can broadcast on allowed channels"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    (realtime.topic() LIKE 'live-session:%' AND public.user_can_access_live_session_topic(realtime.topic()))
    OR (realtime.topic() LIKE 'doubt-session:%' AND EXISTS (
      SELECT 1 FROM public.doubt_sessions ds
      WHERE ds.id::text = split_part(realtime.topic(), ':', 2)
        AND (ds.student_id = auth.uid() OR ds.teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    ))
  );

-- Enrollment check on live_participants INSERT
DROP POLICY IF EXISTS "Users can only join active live sessions" ON public.live_participants;
CREATE POLICY "Users can only join active live sessions"
  ON public.live_participants FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.live_sessions ls
      LEFT JOIN public.courses c ON c.id = ls.course_id
      WHERE ls.id = live_participants.session_id
        AND ls.is_active = true
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'teacher'::app_role)
          OR ls.course_id IS NULL
          OR (c.price IS NULL OR c.price = 0)
          OR EXISTS (
            SELECT 1 FROM public.enrollments e
            WHERE e.user_id = auth.uid()
              AND e.course_id = ls.course_id
              AND e.status = 'active'
          )
        )
    )
  );

-- 3. username_impersonation — apply enforce_user_name_from_profile trigger
DROP TRIGGER IF EXISTS enforce_user_name_comments ON public.comments;
CREATE TRIGGER enforce_user_name_comments
  BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS enforce_user_name_community_comments ON public.community_comments;
CREATE TRIGGER enforce_user_name_community_comments
  BEFORE INSERT OR UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS enforce_user_name_live_messages ON public.live_messages;
CREATE TRIGGER enforce_user_name_live_messages
  BEFORE INSERT OR UPDATE ON public.live_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS enforce_user_name_live_participants ON public.live_participants;
CREATE TRIGGER enforce_user_name_live_participants
  BEFORE INSERT OR UPDATE ON public.live_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

-- 4. SUPA_(anon|authenticated)_security_definer_function_executable —
-- revoke public EXECUTE on all SECURITY DEFINER functions in public,
-- re-grant only whitelisted ones.
DO $$
DECLARE
  r record;
  anon_wl text[] := ARRAY['get_platform_stats','check_rate_limit_text'];
  auth_wl text[] := ARRAY[
    'get_platform_stats','has_role','get_user_role','get_user_profiles_admin',
    'get_quiz_questions','verify_enrollment_for_attendance','increment_book_clicks',
    'get_course_lesson_stats','get_course_bundle','process_refund',
    'audit_security_policies','user_can_access_live_session_topic',
    'check_rate_limit_text'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
    IF r.proname = ANY(auth_wl) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                     r.proname, r.args);
    END IF;
    IF r.proname = ANY(anon_wl) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
                     r.proname, r.args);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                   r.proname, r.args);
  END LOOP;
END $$;

-- 5. SUPA_pg_graphql_(anon|authenticated)_table_exposed —
-- the app uses PostgREST (Data API), not GraphQL. Revoke usage on
-- graphql_public so no public schema table is discoverable via GraphQL.
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
