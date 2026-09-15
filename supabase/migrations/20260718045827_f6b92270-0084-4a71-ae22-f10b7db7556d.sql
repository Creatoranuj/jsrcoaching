CREATE TABLE public.live_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);
GRANT SELECT, INSERT, DELETE ON public.live_reminders TO authenticated;
GRANT ALL ON public.live_reminders TO service_role;
ALTER TABLE public.live_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reminders read" ON public.live_reminders FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "own reminders insert" ON public.live_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "own reminders delete" ON public.live_reminders FOR DELETE TO authenticated USING (auth.uid()=user_id);
CREATE INDEX idx_live_reminders_session ON public.live_reminders(session_id);