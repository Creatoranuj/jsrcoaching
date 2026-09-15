
-- Create lesson_pdfs table for multiple PDF attachments per lesson
CREATE TABLE public.lesson_pdfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lesson_pdfs ENABLE ROW LEVEL SECURITY;

-- Admins/teachers can manage
CREATE POLICY "Admins and teachers can manage lesson_pdfs"
  ON public.lesson_pdfs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Authenticated users can read
CREATE POLICY "Authenticated users can view lesson_pdfs"
  ON public.lesson_pdfs FOR SELECT TO authenticated
  USING (true);

-- Create lecture-pdfs storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('lecture-pdfs', 'lecture-pdfs', true);

-- Storage policies
CREATE POLICY "Anyone can read lecture-pdfs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lecture-pdfs');

CREATE POLICY "Admins can upload lecture-pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lecture-pdfs' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete lecture-pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lecture-pdfs' AND has_role(auth.uid(), 'admin'::app_role));
