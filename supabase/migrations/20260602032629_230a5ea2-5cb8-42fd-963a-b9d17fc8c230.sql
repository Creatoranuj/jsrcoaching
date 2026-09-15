ALTER TABLE public.lesson_pdfs
  ADD COLUMN IF NOT EXISTS skill_level text NOT NULL DEFAULT 'beginner'
    CHECK (skill_level IN ('beginner','intermediate','advanced')),
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_lesson_pdfs_skill_subject
  ON public.lesson_pdfs (skill_level, subject);

CREATE INDEX IF NOT EXISTS idx_lesson_pdfs_lesson
  ON public.lesson_pdfs (lesson_id);

CREATE OR REPLACE FUNCTION public.touch_lesson_pdfs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_lesson_pdfs_updated_at ON public.lesson_pdfs;
CREATE TRIGGER trg_lesson_pdfs_updated_at
  BEFORE UPDATE ON public.lesson_pdfs
  FOR EACH ROW EXECUTE FUNCTION public.touch_lesson_pdfs_updated_at();