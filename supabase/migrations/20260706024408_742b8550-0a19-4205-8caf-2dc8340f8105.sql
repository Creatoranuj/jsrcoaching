
-- 1. Composite index for hot quiz_attempts query (user_id + created_at DESC, submitted only)
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_submitted
  ON public.quiz_attempts (user_id, created_at DESC)
  WHERE submitted_at IS NOT NULL;

-- 2. Dashboard snapshot RPC — one round-trip for the caller
CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'enrollments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'course_id', e.course_id,
        'status', e.status,
        'progress_percentage', e.progress_percentage,
        'purchased_at', e.purchased_at,
        'last_watched_lesson_id', e.last_watched_lesson_id,
        'course', jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'thumbnail_url', c.thumbnail_url,
          'image_url', c.image_url,
          'teacher_name', c.teacher_name
        )
      ) ORDER BY e.purchased_at DESC NULLS LAST)
      FROM public.enrollments e
      LEFT JOIN public.courses c ON c.id = e.course_id
      WHERE e.user_id = _uid AND e.status = 'active'
    ), '[]'::jsonb),
    'lesson_progress_count', (
      SELECT count(*) FROM public.lesson_progress WHERE user_id = _uid
    ),
    'lessons_completed', (
      SELECT count(*) FROM public.lesson_progress WHERE user_id = _uid AND completed = true
    ),
    'quiz_stats', (
      SELECT jsonb_build_object(
        'attempts', count(*),
        'passed', count(*) FILTER (WHERE passed = true),
        'avg_percentage', COALESCE(round(avg(percentage)::numeric, 2), 0)
      )
      FROM public.quiz_attempts
      WHERE user_id = _uid AND submitted_at IS NOT NULL
    ),
    'recent_quiz_attempts', COALESCE((
      SELECT jsonb_agg(row_to_json(q))
      FROM (
        SELECT id, quiz_id, score, percentage, passed, submitted_at, created_at
        FROM public.quiz_attempts
        WHERE user_id = _uid AND submitted_at IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 5
      ) q
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

-- 3. Lock down SECURITY DEFINER function execute to authenticated only
REVOKE EXECUTE ON FUNCTION public.get_dashboard_snapshot() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_user_profiles_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.get_course_lesson_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_course_lesson_stats() TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.search_lectures(text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.search_lectures(text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_book_clicks(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_book_clicks(uuid) TO authenticated;
