
CREATE OR REPLACE FUNCTION public.get_course_lesson_stats()
RETURNS TABLE(course_id bigint, lesson_count bigint, total_duration bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT course_id, COUNT(*)::bigint AS lesson_count, COALESCE(SUM(duration), 0)::bigint AS total_duration
  FROM public.lessons
  WHERE course_id IS NOT NULL
  GROUP BY course_id
$$;

GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats() TO anon, authenticated, service_role;
