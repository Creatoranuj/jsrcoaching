-- Add duration column to lessons table for video duration tracking
ALTER TABLE public.lessons 
ADD COLUMN IF NOT EXISTS duration integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.lessons.duration IS 'Video duration in seconds';