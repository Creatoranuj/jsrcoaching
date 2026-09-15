-- 1. Update chatbot_settings: increase max_tokens default to 1000
ALTER TABLE public.chatbot_settings ALTER COLUMN max_tokens SET DEFAULT 1000;
UPDATE public.chatbot_settings SET max_tokens = 1000 WHERE id = 1 AND max_tokens = 500;

-- 2. Create chatbot_feedback table for thumbs up/down
CREATE TABLE IF NOT EXISTS public.chatbot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id TEXT,
  message_content TEXT,
  response_content TEXT,
  rating INTEGER CHECK (rating IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback" ON public.chatbot_feedback
  FOR INSERT WITH CHECK ((auth.uid() = user_id) OR (user_id IS NULL));

CREATE POLICY "Admins can view all feedback" ON public.chatbot_feedback
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own feedback" ON public.chatbot_feedback
  FOR SELECT USING (auth.uid() = user_id);