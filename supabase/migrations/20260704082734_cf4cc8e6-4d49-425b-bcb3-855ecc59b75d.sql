DROP POLICY IF EXISTS "Enrolled users can read gated content" ON storage.objects;

CREATE POLICY "Enrolled users can read gated content"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'content'
  AND COALESCE((storage.foldername(name))[1], '') NOT IN
        ('hero-banners', 'thumbnails', 'chapter-icons')
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    -- Enrolled in the course whose lesson references this object
    -- (checks both class_pdf_url and video_url).
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.enrollments e ON e.course_id = l.course_id
      WHERE (
              l.class_pdf_url LIKE '%/content/' || storage.objects.name
           OR l.class_pdf_url LIKE '%/content/' || storage.objects.name || '?%'
           OR l.class_pdf_url = 'storage://content/' || storage.objects.name
           OR l.video_url     LIKE '%/content/' || storage.objects.name
           OR l.video_url     LIKE '%/content/' || storage.objects.name || '?%'
           OR l.video_url     = 'storage://content/' || storage.objects.name
      )
        AND e.user_id = auth.uid()
        AND e.status  = 'active'
    )
    -- Free course lessons.
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE (
              l.class_pdf_url LIKE '%/content/' || storage.objects.name
           OR l.class_pdf_url = 'storage://content/' || storage.objects.name
           OR l.video_url     LIKE '%/content/' || storage.objects.name
           OR l.video_url     = 'storage://content/' || storage.objects.name
      )
        AND (c.price IS NULL OR c.price = 0)
    )
    OR EXISTS (
      SELECT 1 FROM public.materials m
      WHERE m.file_url LIKE '%/content/' || storage.objects.name
         OR m.file_url LIKE '%/content/' || storage.objects.name || '?%'
         OR m.file_url = 'storage://content/' || storage.objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.pdf_url LIKE '%/content/' || storage.objects.name
         OR n.pdf_url LIKE '%/content/' || storage.objects.name || '?%'
         OR n.pdf_url = 'storage://content/' || storage.objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.image_url LIKE '%/content/' || storage.objects.name
         OR q.image_url LIKE '%/content/' || storage.objects.name || '?%'
         OR q.image_url = 'storage://content/' || storage.objects.name
    )
  )
);

CREATE INDEX IF NOT EXISTS lessons_video_url_idx
  ON public.lessons (video_url) WHERE video_url IS NOT NULL;