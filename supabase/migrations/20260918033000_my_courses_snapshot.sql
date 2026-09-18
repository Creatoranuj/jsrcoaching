-- My Courses fast path: single RPC + hot-path indexes.
CREATE OR REPLACE FUNCTION public.get_my_courses_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  enr AS (
    SELECT e.id AS enrollment_id, e.course_id, e.purchased_at,
           c.title, c.grade, c.image_url, c.thumbnail_url, c.price,
           c.start_date, c.end_date, c.description
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.user_id = (SELECT uid FROM me) AND e.status = 'active'
  ),
  lesson_totals AS (
    SELECT l.course_id, count(*)::int AS total_lessons
    FROM public.lessons l
    WHERE l.course_id IN (SELECT course_id FROM enr)
    GROUP BY l.course_id
  ),
  completed AS (
    SELECT l.course_id, count(DISTINCT p.lesson_id)::int AS completed_lessons
    FROM public.user_progress p
    JOIN public.lessons l ON l.id = p.lesson_id
    WHERE p.user_id = (SELECT uid FROM me) AND p.completed IS TRUE
      AND l.course_id IN (SELECT course_id FROM enr)
    GROUP BY l.course_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'enrollment_id', enr.enrollment_id,
      'course_id', enr.course_id,
      'purchased_at', enr.purchased_at,
      'title', enr.title,
      'grade', enr.grade,
      'image_url', enr.image_url,
      'thumbnail_url', enr.thumbnail_url,
      'price', enr.price,
      'start_date', enr.start_date,
      'end_date', enr.end_date,
      'description', enr.description,
      'total_lessons', coalesce(lt.total_lessons, 0),
      'completed_lessons', coalesce(cp.completed_lessons, 0)
    ) ORDER BY enr.purchased_at DESC), '[]'::jsonb)
  FROM enr
  LEFT JOIN lesson_totals lt ON lt.course_id = enr.course_id
  LEFT JOIN completed cp ON cp.course_id = enr.course_id;
$$;

REVOKE ALL ON FUNCTION public.get_my_courses_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_courses_snapshot() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active_login
  ON public.user_sessions (user_id, is_active, logged_in_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status
  ON public.enrollments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_completed
  ON public.user_progress (user_id, completed);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id
  ON public.lessons (course_id);
