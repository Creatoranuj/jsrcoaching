-- Per-user bookmarks on a lesson timeline (video player → notes integration)
CREATE TABLE IF NOT EXISTS public.lesson_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL,
  at_seconds INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_bookmarks_user_lesson
  ON public.lesson_bookmarks (user_id, lesson_id, at_seconds);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_bookmarks TO authenticated;
GRANT ALL ON public.lesson_bookmarks TO service_role;

ALTER TABLE public.lesson_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bookmarks"
  ON public.lesson_bookmarks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own bookmarks"
  ON public.lesson_bookmarks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own bookmarks"
  ON public.lesson_bookmarks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own bookmarks"
  ON public.lesson_bookmarks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER lesson_bookmarks_updated_at
  BEFORE UPDATE ON public.lesson_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();