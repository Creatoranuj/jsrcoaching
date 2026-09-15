-- Seekbar markers + accurate-completion column (fixes 400/404 flood + Sentry noise)

-- 1. lesson_chapters
CREATE TABLE IF NOT EXISTS public.lesson_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  start_seconds int NOT NULL CHECK (start_seconds >= 0),
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lesson_chapters TO anon, authenticated;
GRANT ALL ON public.lesson_chapters TO service_role;
ALTER TABLE public.lesson_chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read lesson chapters" ON public.lesson_chapters;
CREATE POLICY "Anyone can read lesson chapters"
  ON public.lesson_chapters FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins/teachers manage chapters" ON public.lesson_chapters;
CREATE POLICY "Admins/teachers manage chapters"
  ON public.lesson_chapters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));
CREATE INDEX IF NOT EXISTS lesson_chapters_lesson_idx
  ON public.lesson_chapters(lesson_id, start_seconds);

-- 2. lesson_quiz_markers
CREATE TABLE IF NOT EXISTS public.lesson_quiz_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  at_seconds int NOT NULL CHECK (at_seconds >= 0),
  label text,
  quiz_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lesson_quiz_markers TO anon, authenticated;
GRANT ALL ON public.lesson_quiz_markers TO service_role;
ALTER TABLE public.lesson_quiz_markers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read quiz markers" ON public.lesson_quiz_markers;
CREATE POLICY "Anyone can read quiz markers"
  ON public.lesson_quiz_markers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins/teachers manage quiz markers" ON public.lesson_quiz_markers;
CREATE POLICY "Admins/teachers manage quiz markers"
  ON public.lesson_quiz_markers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));
CREATE INDEX IF NOT EXISTS lesson_quiz_markers_lesson_idx
  ON public.lesson_quiz_markers(lesson_id, at_seconds);

-- 3. lesson_progress.watched_intervals column
ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS watched_intervals jsonb NOT NULL DEFAULT '[]'::jsonb;