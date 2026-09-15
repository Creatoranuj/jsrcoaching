DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'lecture_notes_lesson_user_unique'
  ) THEN
    ALTER TABLE public.lecture_notes ADD CONSTRAINT lecture_notes_lesson_user_unique UNIQUE (lesson_id, user_id);
  END IF;
END $$;