-- Apply via Lovable Cloud → Backend → SQL editor, OR Supabase dashboard.
-- Adds chapter / quiz / bookmark markers + accurate-completion column.

-- 1. Lesson chapters (author-defined timeline sections)
CREATE TABLE IF NOT EXISTS public.lesson_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  start_seconds int NOT NULL CHECK (start_seconds >= 0),
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_chapters_lesson_idx
  ON public.lesson_chapters(lesson_id, start_seconds);

GRANT SELECT ON public.lesson_chapters TO authenticated, anon;
GRANT ALL ON public.lesson_chapters TO service_role;
ALTER TABLE public.lesson_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read lesson chapters" ON public.lesson_chapters;
CREATE POLICY "Anyone can read lesson chapters"
  ON public.lesson_chapters FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins/teachers manage chapters" ON public.lesson_chapters;
CREATE POLICY "Admins/teachers manage chapters"
  ON public.lesson_chapters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));


-- 2. Quiz / checkpoint markers
CREATE TABLE IF NOT EXISTS public.lesson_quiz_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  at_seconds int NOT NULL CHECK (at_seconds >= 0),
  label text,
  quiz_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_quiz_markers_lesson_idx
  ON public.lesson_quiz_markers(lesson_id, at_seconds);

GRANT SELECT ON public.lesson_quiz_markers TO authenticated, anon;
GRANT ALL ON public.lesson_quiz_markers TO service_role;
ALTER TABLE public.lesson_quiz_markers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read quiz markers" ON public.lesson_quiz_markers;
CREATE POLICY "Anyone can read quiz markers"
  ON public.lesson_quiz_markers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins/teachers manage quiz markers" ON public.lesson_quiz_markers;
CREATE POLICY "Admins/teachers manage quiz markers"
  ON public.lesson_quiz_markers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));


-- 3. Per-user bookmarks
CREATE TABLE IF NOT EXISTS public.lesson_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  at_seconds int NOT NULL CHECK (at_seconds >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_bookmarks_user_lesson_idx
  ON public.lesson_bookmarks(user_id, lesson_id, at_seconds);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_bookmarks TO authenticated;
GRANT ALL ON public.lesson_bookmarks TO service_role;
ALTER TABLE public.lesson_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own bookmarks" ON public.lesson_bookmarks;
CREATE POLICY "Users read own bookmarks"
  ON public.lesson_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own bookmarks" ON public.lesson_bookmarks;
CREATE POLICY "Users insert own bookmarks"
  ON public.lesson_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own bookmarks" ON public.lesson_bookmarks;
CREATE POLICY "Users update own bookmarks"
  ON public.lesson_bookmarks FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own bookmarks" ON public.lesson_bookmarks;
CREATE POLICY "Users delete own bookmarks"
  ON public.lesson_bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- 4. Accurate completion: store actually-watched [start,end] segments.
ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS watched_intervals jsonb NOT NULL DEFAULT '[]'::jsonb;
