
CREATE TABLE public.smart_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id bigint REFERENCES public.courses(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Smart Note',
  content_md text NOT NULL DEFAULT '',
  file_url text,
  file_name text,
  file_mime text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_notes TO authenticated;
GRANT ALL ON public.smart_notes TO service_role;

ALTER TABLE public.smart_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own smart notes"
  ON public.smart_notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own smart notes"
  ON public.smart_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own smart notes"
  ON public.smart_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own smart notes"
  ON public.smart_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage smart notes"
  ON public.smart_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_smart_notes_user_lesson ON public.smart_notes(user_id, lesson_id);
CREATE INDEX idx_smart_notes_lesson ON public.smart_notes(lesson_id);

CREATE TRIGGER trg_smart_notes_updated_at
  BEFORE UPDATE ON public.smart_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
