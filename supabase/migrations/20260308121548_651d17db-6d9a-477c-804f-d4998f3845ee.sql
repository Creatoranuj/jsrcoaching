-- Create doubt_sessions table
CREATE TABLE public.doubt_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  teacher_id uuid,
  course_id bigint REFERENCES public.courses(id) ON DELETE SET NULL,
  subject text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  zoom_meeting_id text,
  zoom_join_url text,
  zoom_password text,
  zoom_meeting_number text,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doubt_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own doubt sessions"
  ON public.doubt_sessions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students create doubt sessions"
  ON public.doubt_sessions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own pending doubt sessions"
  ON public.doubt_sessions FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Admins and teachers view all doubt sessions"
  ON public.doubt_sessions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins and teachers manage doubt sessions"
  ON public.doubt_sessions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE OR REPLACE FUNCTION public.update_doubt_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_doubt_sessions_updated_at
  BEFORE UPDATE ON public.doubt_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_doubt_sessions_updated_at();