
-- Create live_participants table for raise hand feature
CREATE TABLE IF NOT EXISTS public.live_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  hand_raised boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

ALTER TABLE public.live_participants ENABLE ROW LEVEL SECURITY;

-- Students can manage their own participation record
CREATE POLICY "Users manage own participation"
  ON public.live_participants
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins and teachers can view all participants (for raised hands list)
CREATE POLICY "Admins and teachers view all participants"
  ON public.live_participants
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'teacher'::app_role)
  );

-- Admins and teachers can update participants (dismiss raised hand)
CREATE POLICY "Admins and teachers update participants"
  ON public.live_participants
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'teacher'::app_role)
  );

-- Add recording_url column to live_sessions for post-class replay
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS recording_url text;

-- Allow teachers to update live_messages (answer doubts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'live_messages' AND policyname = 'Teachers can update messages'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can update messages" ON public.live_messages FOR UPDATE USING (public.has_role(auth.uid(), ''teacher''::app_role))';
  END IF;
END $$;
