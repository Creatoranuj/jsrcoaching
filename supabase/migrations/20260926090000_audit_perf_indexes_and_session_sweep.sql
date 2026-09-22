-- Audit 2026-09-22 (P1 perf + P1 hygiene). Already applied to the live
-- project on 2026-09-22; kept here so the CI drift check and any fresh
-- environment converge on the same schema.
--
-- 1) Indexes for high-growth tables that are filtered by user_id / created_at
--    in the admin dashboard and student screens but only had a primary key.
-- 2) An idle-session sweep: user_sessions rows stayed is_active=true for the
--    full 30-day TTL (941 "active" sessions for 51 users live), which inflated
--    the admin "active sessions" metric and every per-user session query.

CREATE INDEX IF NOT EXISTS idx_app_installs_user_id
  ON public.app_installs (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chatbot_logs_user_created
  ON public.chatbot_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatbot_logs_session_id
  ON public.chatbot_logs (session_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_id
  ON public.comments (user_id);

CREATE INDEX IF NOT EXISTS idx_doubts_user_created
  ON public.doubts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_user_id
  ON public.error_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_lesson_likes_user_id
  ON public.lesson_likes (user_id);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id
  ON public.lesson_progress (lesson_id);

CREATE INDEX IF NOT EXISTS idx_live_messages_user_id
  ON public.live_messages (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_created_at
  ON public.payment_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_course_id
  ON public.payment_events (course_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type_created
  ON public.payment_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_created
  ON public.quiz_attempts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_created
  ON public.security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id
  ON public.security_events (user_id);

-- Idle-session sweep -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_idle_user_sessions(p_idle_hours integer DEFAULT 72)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.user_sessions
     SET is_active = false
   WHERE is_active = true
     AND last_active_at < now() - make_interval(hours => greatest(p_idle_hours, 1));
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_idle_user_sessions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_idle_user_sessions(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_idle_user_sessions(integer) TO service_role;

-- Schedule hourly when pg_cron is available (it is on the live project; the
-- CI drift database has no pg_cron, so this is a no-op there).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deactivate-idle-user-sessions') THEN
      PERFORM cron.unschedule('deactivate-idle-user-sessions');
    END IF;
    PERFORM cron.schedule(
      'deactivate-idle-user-sessions',
      '35 * * * *',
      $cron$SELECT public.deactivate_idle_user_sessions(72);$cron$
    );
  END IF;
END
$do$;
