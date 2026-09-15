-- P1 perf: get_course_lesson_stats rewrite
-- Root cause: repeated seq-scan on lessons (26 cols, growing) even with prior covering idx
-- Fix: dedicated covering index + PARALLEL SAFE hint so planner can split work
CREATE INDEX IF NOT EXISTS lessons_course_id_duration_idx
  ON public.lessons (course_id) INCLUDE (duration)
  WHERE course_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_course_lesson_stats()
RETURNS TABLE(course_id bigint, lesson_count bigint, total_duration bigint)
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT course_id,
         COUNT(*)::bigint AS lesson_count,
         COALESCE(SUM(duration), 0)::bigint AS total_duration
  FROM public.lessons
  WHERE course_id IS NOT NULL
  GROUP BY course_id
$$;

-- Preserve grants (idempotent — matches existing whitelist)
REVOKE EXECUTE ON FUNCTION public.get_course_lesson_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats() TO authenticated, service_role;