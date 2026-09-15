-- 1) comment-images: tighten SELECT to owner OR image referenced by a comment row
DROP POLICY IF EXISTS "auth list comment-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read comment-images" ON storage.objects;

CREATE POLICY "Read comment-images if owner or attached to a comment"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'comment-images'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.image_url IS NOT NULL
        AND c.image_url LIKE '%' || name
    )
  )
);

-- 2) study-materials: replace substring match with exact path equality
DROP POLICY IF EXISTS "Enrolled students or staff can read study material files" ON storage.objects;

CREATE POLICY "Enrolled students or staff can read study material files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'study-materials'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.study_materials sm
      JOIN public.enrollments e
        ON e.course_id = sm.course_id AND e.user_id = auth.uid()
      WHERE sm.file_url = 'study-materials/' || objects.name
        AND e.status = 'active'
    )
  )
);