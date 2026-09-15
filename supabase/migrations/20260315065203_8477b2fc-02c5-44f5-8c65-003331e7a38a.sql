
-- Create student_notes table
CREATE TABLE public.student_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled Note',
  content text DEFAULT '',
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  file_url text,
  file_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own notes
CREATE POLICY "Users can view own notes" ON public.student_notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own notes" ON public.student_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes" ON public.student_notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes" ON public.student_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can view all notes" ON public.student_notes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_student_notes_updated_at()
  RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_student_notes_updated_at
  BEFORE UPDATE ON public.student_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_student_notes_updated_at();

-- Create storage bucket for student notes
INSERT INTO storage.buckets (id, name, public) VALUES ('student-notes', 'student-notes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for student-notes bucket
CREATE POLICY "Users can upload own notes files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own notes files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'student-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own notes files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'student-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Enable realtime for live_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
