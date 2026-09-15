
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

  WITH my_enrollments AS (
    SELECT e.id, e.course_id, e.status, e.progress_percentage,
           e.purchased_at, e.last_watched_lesson_id,
           c.title, c.description, c.grade, c.image_url, c.thumbnail_url
    FROM public.enrollments e
    LEFT JOIN public.courses c ON c.id = e.course_id
    WHERE e.user_id = _uid AND e.status = 'active'
  ),
  course_lessons AS (
    SELECT l.id, l.course_id
    FROM public.lessons l
    WHERE l.course_id IN (SELECT course_id FROM my_enrollments WHERE course_id IS NOT NULL)
  ),
  my_progress AS (
    SELECT lesson_id, course_id, completed
    FROM public.user_progress
    WHERE user_id = _uid
  )
  SELECT jsonb_build_object(
    'enrollments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', me.id,
        'course_id', me.course_id,
        'status', me.status,
        'progress_percentage', me.progress_percentage,
        'purchased_at', me.purchased_at,
        'last_watched_lesson_id', me.last_watched_lesson_id,
        'course', jsonb_build_object(
          'id', me.course_id,
          'title', me.title,
          'description', me.description,
          'grade', me.grade,
          'image_url', me.image_url,
          'thumbnail_url', me.thumbnail_url
        )
      ) ORDER BY me.purchased_at DESC NULLS LAST)
      FROM my_enrollments me
    ), '[]'::jsonb),
    'course_lessons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cl.id, 'course_id', cl.course_id))
      FROM course_lessons cl
    ), '[]'::jsonb),
    'user_progress', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lesson_id', mp.lesson_id,
        'course_id', mp.course_id,
        'completed', mp.completed
      ))
      FROM my_progress mp
    ), '[]'::jsonb),
    'lesson_progress_count', (SELECT count(*) FROM public.lesson_progress WHERE user_id = _uid),
    'lessons_completed', (SELECT count(*) FROM public.lesson_progress WHERE user_id = _uid AND completed = true),
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
      SELECT jsonb_agg(jsonb_build_object(
        'id', qa.id,
        'quiz_id', qa.quiz_id,
        'score', qa.score,
        'percentage', qa.percentage,
        'passed', qa.passed,
        'submitted_at', qa.submitted_at,
        'created_at', qa.created_at,
        'quizzes', CASE WHEN qz.id IS NULL THEN NULL ELSE
          jsonb_build_object('title', qz.title, 'type', qz.type, 'total_marks', qz.total_marks)
        END
      ) ORDER BY qa.created_at DESC)
      FROM (
        SELECT * FROM public.quiz_attempts
        WHERE user_id = _uid AND submitted_at IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 10
      ) qa
      LEFT JOIN public.quizzes qz ON qz.id = qa.quiz_id
    ), '[]'::jsonb),
    'upcoming_doubts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ds.id,
        'subject', ds.subject,
        'scheduled_at', ds.scheduled_at,
        'zoom_join_url', ds.zoom_join_url,
        'status', ds.status
      ) ORDER BY ds.scheduled_at ASC)
      FROM (
        SELECT id, subject, scheduled_at, zoom_join_url, status
        FROM public.doubt_sessions
        WHERE student_id = _uid AND status IN ('scheduled', 'active')
        ORDER BY scheduled_at ASC
        LIMIT 3
      ) ds
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_snapshot() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO authenticated;
