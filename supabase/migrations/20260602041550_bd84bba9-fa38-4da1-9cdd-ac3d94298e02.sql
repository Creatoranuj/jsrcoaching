-- 1. Lessons: add missing columns
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS duration_seconds int,
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;

-- 2. Narrow view for the player
CREATE OR REPLACE VIEW public.lesson_video_meta AS
SELECT id, youtube_id, duration_seconds, is_free, is_preview, title, course_id
FROM public.lessons;
GRANT SELECT ON public.lesson_video_meta TO authenticated, anon;

-- 3. lesson_progress table
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  watched_seconds int NOT NULL DEFAULT 0,
  last_position_seconds int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO authenticated;
GRANT ALL ON public.lesson_progress TO service_role;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own progress read" ON public.lesson_progress;
DROP POLICY IF EXISTS "own progress insert" ON public.lesson_progress;
DROP POLICY IF EXISTS "own progress update" ON public.lesson_progress;
CREATE POLICY "own progress read" ON public.lesson_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own progress insert" ON public.lesson_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own progress update" ON public.lesson_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. security_events table
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own events insert" ON public.security_events;
DROP POLICY IF EXISTS "admin reads events" ON public.security_events;
CREATE POLICY "own events insert" ON public.security_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin reads events" ON public.security_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));