CREATE OR REPLACE FUNCTION public.get_course_lesson_stats()
RETURNS TABLE(course_id bigint, lesson_count bigint, total_duration bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT l.course_id,
           COUNT(*)::bigint AS lesson_count,
           COALESCE(SUM(l.duration), 0)::bigint AS total_duration
    FROM public.lessons l
    WHERE l.course_id IS NOT NULL
    GROUP BY l.course_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_course_lesson_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats() TO authenticated, service_role;