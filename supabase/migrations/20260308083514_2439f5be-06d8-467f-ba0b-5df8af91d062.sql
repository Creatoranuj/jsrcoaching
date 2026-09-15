-- Create live_sessions table
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  youtube_live_id text NOT NULL,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  is_active boolean DEFAULT false,
  course_id bigint REFERENCES public.courses(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view live sessions"
  ON public.live_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage live sessions"
  ON public.live_sessions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create live_messages table
CREATE TABLE public.live_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'chat' CHECK (type IN ('chat', 'doubt')),
  is_answered boolean DEFAULT false,
  answer text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view live messages"
  ON public.live_messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert own messages"
  ON public.live_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

CREATE POLICY "Admins can update messages"
  ON public.live_messages FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own messages"
  ON public.live_messages FOR DELETE
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_live_messages_session_id ON public.live_messages(session_id);
CREATE INDEX idx_live_messages_created_at ON public.live_messages(created_at);
CREATE INDEX idx_live_sessions_is_active ON public.live_sessions(is_active);