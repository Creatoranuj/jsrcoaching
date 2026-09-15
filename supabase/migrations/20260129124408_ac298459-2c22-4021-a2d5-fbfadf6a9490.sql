-- Create chapters table for the PW-style hierarchy: Course → Chapter → Lessons
CREATE TABLE public.chapters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id bigint NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  code text NOT NULL, -- e.g., "CH-01", "CH-02"
  title text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create lecture_notes table for user notes on lectures
CREATE TABLE public.lecture_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  markdown text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(lesson_id, user_id)
);

-- Create lecture_type enum
DO $$ BEGIN
  CREATE TYPE lecture_type AS ENUM ('VIDEO', 'PDF', 'DPP', 'NOTES');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to lessons table
ALTER TABLE public.lessons 
ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS lecture_type text DEFAULT 'VIDEO',
ADD COLUMN IF NOT EXISTS position integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS youtube_id text;

-- Enable RLS on new tables
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_notes ENABLE ROW LEVEL SECURITY;

-- RLS for chapters - anyone can view, only admins/teachers can manage
CREATE POLICY "Anyone can view chapters" 
ON public.chapters FOR SELECT 
USING (true);

CREATE POLICY "Admins and teachers can manage chapters" 
ON public.chapters FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- RLS for lecture_notes - users can manage their own notes
CREATE POLICY "Users can view their own notes" 
ON public.lecture_notes FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notes" 
ON public.lecture_notes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes" 
ON public.lecture_notes FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes" 
ON public.lecture_notes FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chapters_course_id ON public.chapters(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_chapter_id ON public.lessons(chapter_id);
CREATE INDEX IF NOT EXISTS idx_lecture_notes_lesson_user ON public.lecture_notes(lesson_id, user_id);