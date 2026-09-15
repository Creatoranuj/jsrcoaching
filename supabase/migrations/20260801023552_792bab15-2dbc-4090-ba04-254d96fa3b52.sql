-- Helper: is the caller staff or an actively enrolled student?
CREATE OR REPLACE FUNCTION public.can_read_course_files()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = auth.uid()
               AND ur.role IN ('admin'::app_role, 'teacher'::app_role))
    OR EXISTS (SELECT 1 FROM public.enrollments e
                WHERE e.user_id = auth.uid() AND e.status = 'active')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_course_files() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_course_files() TO authenticated, service_role;

-- Presentation images in the content bucket: any signed-in user may read.
DROP POLICY IF EXISTS "Signed-in read content presentation images" ON storage.objects;
CREATE POLICY "Signed-in read content presentation images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'content'
  AND (storage.foldername(name))[1] IN ('courses', 'thumbnails', 'hero-banners', 'chapter-icons')
);

-- Gated study material in the content bucket.
DROP POLICY IF EXISTS "Enrolled read content study files" ON storage.objects;
CREATE POLICY "Enrolled read content study files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'content'
  AND (storage.foldername(name))[1] IN ('lessons', 'materials', 'notes')
  AND public.can_read_course_files()
);

-- Lecture PDFs.
DROP POLICY IF EXISTS "Enrolled read lecture-pdfs" ON storage.objects;
CREATE POLICY "Enrolled read lecture-pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lecture-pdfs' AND public.can_read_course_files());

-- Lesson attachments.
DROP POLICY IF EXISTS "Enrolled read lesson-attachments" ON storage.objects;
CREATE POLICY "Enrolled read lesson-attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lesson-attachments' AND public.can_read_course_files());