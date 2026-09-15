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
GRANT ALL ON public.lesson_ratings TO service_role;

ALTER TABLE public.lesson_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read lesson ratings"
  ON public.lesson_ratings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users insert own rating"
  ON public.lesson_ratings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own rating"
  ON public.lesson_ratings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own rating"
  ON public.lesson_ratings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all ratings"
  ON public.lesson_ratings FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS lesson_ratings_lesson_idx ON public.lesson_ratings(lesson_id);
CREATE INDEX IF NOT EXISTS lesson_ratings_user_idx ON public.lesson_ratings(user_id);

CREATE TRIGGER trg_lesson_ratings_updated_at
  BEFORE UPDATE ON public.lesson_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();