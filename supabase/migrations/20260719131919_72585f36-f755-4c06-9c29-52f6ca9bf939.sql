ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS auto_transcript text,
  ADD COLUMN IF NOT EXISTS auto_transcript_lang text,
  ADD COLUMN IF NOT EXISTS auto_transcript_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_transcript_status text;

CREATE INDEX IF NOT EXISTS lessons_auto_transcript_status_idx
  ON public.lessons(auto_transcript_status);