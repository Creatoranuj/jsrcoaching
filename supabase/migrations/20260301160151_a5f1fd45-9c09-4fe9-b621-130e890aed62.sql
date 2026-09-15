
-- Add class_pdf_url column to lessons table for downloadable class PDFs
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS class_pdf_url text;

-- Add like_count column to lessons table  
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;

-- Create lesson_likes table for tracking per-user likes
CREATE TABLE public.lesson_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(lesson_id, user_id)
);

-- Enable RLS
ALTER TABLE public.lesson_likes ENABLE ROW LEVEL SECURITY;

-- Users can view all likes (to show count)
CREATE POLICY "Anyone authenticated can view likes"
  ON public.lesson_likes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can insert their own likes
CREATE POLICY "Users can like lessons"
  ON public.lesson_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove their own likes
CREATE POLICY "Users can unlike lessons"
  ON public.lesson_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update like_count on lessons
CREATE OR REPLACE FUNCTION public.update_lesson_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.lessons SET like_count = like_count + 1 WHERE id = NEW.lesson_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.lessons SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.lesson_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
CREATE TRIGGER trigger_update_lesson_like_count
AFTER INSERT OR DELETE ON public.lesson_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_lesson_like_count();
