-- Add enrollment-aware SELECT policy on storage.objects for lecture-pdfs
-- so that once we flip the bucket to private, enrolled users, free-course
-- learners, admins and teachers can still read their PDFs.
-- Applied BEFORE the bucket flip so there is zero downtime for legacy URLs
-- (public serving still works, and this policy adds no restriction while
-- bucket.public = true).

DROP POLICY IF EXISTS "Anyone can read lecture-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Enrolled users can read lecture-pdfs" ON storage.objects;

CREATE POLICY "Enrolled users can read lecture-pdfs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lecture-pdfs' AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lesson_pdfs lp
      JOIN public.lessons l   ON l.id = lp.lesson_id
      JOIN public.enrollments e ON e.course_id = l.course_id
      WHERE (
              lp.file_url LIKE '%/lecture-pdfs/' || storage.objects.name
           OR lp.file_url LIKE '%/lecture-pdfs/' || storage.objects.name || '?%'
           OR lp.file_url = 'storage://lecture-pdfs/' || storage.objects.name
      )
        AND e.user_id = auth.uid()
        AND e.status  = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_pdfs lp
      JOIN public.lessons l ON l.id = lp.lesson_id
      JOIN public.courses c ON c.id = l.course_id
      WHERE (
              lp.file_url LIKE '%/lecture-pdfs/' || storage.objects.name
           OR lp.file_url LIKE '%/lecture-pdfs/' || storage.objects.name || '?%'
           OR lp.file_url = 'storage://lecture-pdfs/' || storage.objects.name
      )
        AND (c.price IS NULL OR c.price = 0)
    )
  )
);

-- Speed up the LIKE lookups the policy performs on every signed-URL request.
CREATE INDEX IF NOT EXISTS lesson_pdfs_file_url_idx
  ON public.lesson_pdfs (file_url);