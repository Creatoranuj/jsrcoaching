-- Fix Smart Notes persistence: grant Data API privileges and add unique
-- constraint so upserts can resolve to a single (user, lesson|course) row.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_notes TO authenticated;
GRANT ALL ON public.smart_notes TO service_role;

-- One Smart Note per user per lesson, and one per user per course-only note.
CREATE UNIQUE INDEX IF NOT EXISTS smart_notes_user_lesson_uniq
  ON public.smart_notes (user_id, lesson_id)
  WHERE lesson_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS smart_notes_user_course_uniq
  ON public.smart_notes (user_id, course_id)
  WHERE lesson_id IS NULL AND course_id IS NOT NULL;