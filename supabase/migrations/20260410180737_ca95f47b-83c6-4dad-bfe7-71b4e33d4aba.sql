
-- Drop overly broad storage policies
DROP POLICY IF EXISTS "Enrolled students can view course videos" ON storage.objects;
DROP POLICY IF EXISTS "Enrolled students can view course materials" ON storage.objects;

-- Re-create with course-specific path matching
CREATE POLICY "Enrolled students can view course videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.user_id = auth.uid()
        AND enrollments.status = 'active'
        AND (storage.foldername(name))[1] = enrollments.course_id::text
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

CREATE POLICY "Enrolled students can view course materials"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.user_id = auth.uid()
        AND enrollments.status = 'active'
        AND (storage.foldername(name))[1] = enrollments.course_id::text
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

-- Admin-only SELECT on chatbot_settings
ALTER TABLE public.chatbot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read chatbot settings"
ON public.chatbot_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can modify chatbot settings"
ON public.chatbot_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
