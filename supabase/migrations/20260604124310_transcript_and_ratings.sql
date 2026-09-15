ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS transcript_md text;

CREATE TABLE IF NOT EXISTS public.lesson_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_ratings TO authenticated;
GRANT SELECT ON public.lesson_ratings TO anon;
GRANT ALL ON public.lesson_ratings TO service_role;

ALTER TABLE public.lesson_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read lesson ratings"
  ON public.lesson_ratings FOR SELECT USING (true);

CREATE POLICY "Users insert their own rating"
  ON public.lesson_ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own rating"
  ON public.lesson_ratings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own rating"
  ON public.lesson_ratings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS lesson_ratings_lesson_idx ON public.lesson_ratings(lesson_id);

CREATE OR REPLACE FUNCTION public.update_lesson_ratings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_lesson_ratings_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS update_lesson_ratings_updated_at ON public.lesson_ratings;
CREATE TRIGGER update_lesson_ratings_updated_at
  BEFORE UPDATE ON public.lesson_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_lesson_ratings_updated_at();
