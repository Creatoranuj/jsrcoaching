-- 1. Lock trusted_hosts allowlist (CRITICAL from last audit)
DROP POLICY IF EXISTS "trusted_hosts read all" ON public.trusted_hosts;
REVOKE SELECT ON public.trusted_hosts FROM anon;
DROP POLICY IF EXISTS "trusted_hosts admin read" ON public.trusted_hosts;
CREATE POLICY "trusted_hosts admin read"
  ON public.trusted_hosts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Hot-path indexes (HIGH PERF from last audit)
CREATE INDEX IF NOT EXISTS idx_lessons_course_position  ON public.lessons(course_id, position);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status  ON public.enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_course       ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_ct    ON public.quiz_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz       ON public.quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz           ON public.questions(quiz_id, order_index);
CREATE INDEX IF NOT EXISTS idx_messages_recipient       ON public.messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender          ON public.messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_progress_user       ON public.user_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_doubt_replies_session    ON public.doubt_replies(doubt_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lecture_sched_course     ON public.lecture_schedules(course_id, scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course     ON public.live_sessions(course_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_smart_notes_course       ON public.smart_notes(course_id);
CREATE INDEX IF NOT EXISTS idx_materials_course         ON public.materials(course_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_course          ON public.syllabus(course_id);
CREATE INDEX IF NOT EXISTS idx_timetable_course         ON public.timetable(course_id);