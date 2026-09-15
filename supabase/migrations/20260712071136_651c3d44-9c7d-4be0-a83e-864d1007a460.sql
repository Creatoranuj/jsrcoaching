
-- Fix: require active enrollment for study_materials access
DROP POLICY IF EXISTS "Enrolled students or staff can view study materials" ON public.study_materials;
CREATE POLICY "Enrolled students or staff can view study materials"
ON public.study_materials FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = study_materials.course_id
      AND e.status = 'active'
  )
);

DROP POLICY IF EXISTS "Enrolled students or staff can read study material files" ON storage.objects;
CREATE POLICY "Enrolled students or staff can read study material files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'study-materials'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM study_materials sm
      JOIN enrollments e ON e.course_id = sm.course_id AND e.user_id = auth.uid()
      WHERE sm.file_url IS NOT NULL
        AND POSITION(objects.name IN sm.file_url) > 0
        AND e.status = 'active'
    )
  )
);

-- Fix: restrict comment-images public read to authenticated users
DROP POLICY IF EXISTS "Public read comment-images" ON storage.objects;
CREATE POLICY "Authenticated read comment-images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'comment-images');
