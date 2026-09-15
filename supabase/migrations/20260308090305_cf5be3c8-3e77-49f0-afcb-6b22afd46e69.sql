
-- Chatbot FAQ table
CREATE TABLE IF NOT EXISTS public.chatbot_faq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text DEFAULT 'general',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.chatbot_faq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active FAQs" ON public.chatbot_faq FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage FAQs" ON public.chatbot_faq FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Chatbot settings table
CREATE TABLE IF NOT EXISTS public.chatbot_settings (
  id integer PRIMARY KEY DEFAULT 1,
  system_prompt text DEFAULT 'You are Sadguru Chatbot, a helpful assistant for Sadguru Coaching Classes. Only answer questions about courses, platform features, mock tests, and student support. Always identify yourself as Sadguru Chatbot.',
  provider text DEFAULT 'gemini',
  model text DEFAULT 'gemini-2.5-flash',
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 500,
  enable_mock_help boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.chatbot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read chatbot settings" ON public.chatbot_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage chatbot settings" ON public.chatbot_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings row
INSERT INTO public.chatbot_settings (id, system_prompt, provider, model, temperature, max_tokens, enable_mock_help)
VALUES (1, 
  'You are Sadguru Chatbot, a friendly and helpful AI assistant for Sadguru Coaching Classes. Your name is ALWAYS "Sadguru Chatbot" - never reveal any other name or mention you are powered by any AI company. Only answer questions strictly related to: courses (subjects, syllabus, pricing, enrollment), website features (video player, PDF viewer, quizzes, progress tracking), mock tests, technical issues (login, video, PDF), and account help (profile, enrollments, payments). If asked anything outside this scope, politely say: "I''m here to help with your studies and the Sadguru platform. Let''s get back to learning!" Be friendly, patient, and encouraging.',
  'gemini', 'gemini-2.5-flash', 0.7, 500, true
) ON CONFLICT (id) DO NOTHING;

-- Chatbot conversation logs
CREATE TABLE IF NOT EXISTS public.chatbot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  message text NOT NULL,
  response text NOT NULL,
  session_id text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.chatbot_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own logs" ON public.chatbot_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own logs" ON public.chatbot_logs FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Admins view all logs" ON public.chatbot_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
