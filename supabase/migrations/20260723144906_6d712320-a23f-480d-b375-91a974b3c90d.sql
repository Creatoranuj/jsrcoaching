-- 1. Revoke anon EXECUTE on search_lectures (keep authenticated)
REVOKE EXECUTE ON FUNCTION public.search_lectures(text, integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer) TO authenticated;

-- 2. Composite index for the hot lessons-by-course query
CREATE INDEX IF NOT EXISTS idx_lessons_course_position
  ON public.lessons(course_id, position);