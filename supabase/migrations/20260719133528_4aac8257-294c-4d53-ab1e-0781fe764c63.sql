-- Lane 4 PERF: covering index for get_course_lesson_stats()
-- Function scans lessons GROUP BY course_id summing duration.
-- Existing idx_lessons_course_id doesn't cover duration, forcing heap fetch per row.
CREATE INDEX IF NOT EXISTS lessons_course_stats_idx
  ON public.lessons (course_id)
  INCLUDE (duration)
  WHERE course_id IS NOT NULL;