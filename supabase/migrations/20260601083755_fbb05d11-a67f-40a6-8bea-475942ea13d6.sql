-- Create lesson_attachments table
CREATE TABLE public.lesson_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  mime_type text,
  kind text NOT NULL DEFAULT 'other',
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Grants (auth-only table; no anon)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_attachments TO authenticated;
GRANT ALL ON public.lesson_attachments TO service_role;

-- Enable RLS
ALTER TABLE public.lesson_attachments ENABLE ROW LEVEL SECURITY;

-- Admins and teachers can manage
CREATE POLICY "Admins and teachers can manage lesson_attachments"
ON public.lesson_attachments
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Enrolled users / free-course users / admins / teachers can view (mirrors lesson_pdfs)
CREATE POLICY "Enrolled users and staff can view lesson_attachments"
ON public.lesson_attachments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM lessons l
    JOIN enrollments e ON e.course_id = l.course_id
    WHERE l.id = lesson_attachments.lesson_id
      AND e.user_id = auth.uid()
      AND e.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = lesson_attachments.lesson_id
      AND (c.price IS NULL OR c.price = 0)
  )
);

-- Indexes
CREATE INDEX idx_lesson_attachments_lesson_position
  ON public.lesson_attachments (lesson_id, position);

-- updated_at trigger
CREATE TRIGGER update_lesson_attachments_updated_at
BEFORE UPDATE ON public.lesson_attachments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-attachments', 'lesson-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the bucket
CREATE POLICY "Admins and teachers can upload lesson attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lesson-attachments'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
);

CREATE POLICY "Admins and teachers can update lesson attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'lesson-attachments'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
);

CREATE POLICY "Admins and teachers can delete lesson attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'lesson-attachments'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
);

CREATE POLICY "Enrolled users and staff can read lesson attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lesson-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.lesson_attachments la
      JOIN public.lessons l ON l.id = la.lesson_id
      JOIN public.enrollments e ON e.course_id = l.course_id
      WHERE la.file_url LIKE '%' || storage.objects.name || '%'
        AND e.user_id = auth.uid()
        AND e.status = 'active'
    )
  )
);