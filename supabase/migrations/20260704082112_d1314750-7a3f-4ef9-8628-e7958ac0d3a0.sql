-- Two-policy setup on storage.objects for the `content` bucket. Applied
-- BEFORE the bucket is flipped to private so legacy public serving stays
-- working during the transition.

-- Clean any stale/overlapping SELECT policies we're about to redefine.
DROP POLICY IF EXISTS "Public content assets readable" ON storage.objects;
DROP POLICY IF EXISTS "Enrolled users can read gated content" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view content" ON storage.objects;
DROP POLICY IF EXISTS "Content is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public can view content" ON storage.objects;

-- 1. Public marketing/UX folders — anon + authenticated read.
-- Landing page hero banners, course/lesson thumbnails, chapter icons.
CREATE POLICY "Public content assets readable"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'content'
  AND (storage.foldername(name))[1] IN ('hero-banners', 'thumbnails', 'chapter-icons')
);

-- 2. Gated paid content — enrolled users, free-course learners, admins, teachers.
-- Covers files under lessons/, materials/, notes/, and quiz images stored at
-- the bucket root. Referenced by lessons.class_pdf_url, materials.file_url,
-- notes.pdf_url, questions.image_url.
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
    -- Enrolled in the course whose lesson references this object.
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.enrollments e ON e.course_id = l.course_id
      WHERE (
              l.class_pdf_url LIKE '%/content/' || storage.objects.name
           OR l.class_pdf_url LIKE '%/content/' || storage.objects.name || '?%'
           OR l.class_pdf_url = 'storage://content/' || storage.objects.name
      )
        AND e.user_id = auth.uid()
        AND e.status  = 'active'
    )
    -- Free course lesson PDFs (open to any authenticated user).
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE (
              l.class_pdf_url LIKE '%/content/' || storage.objects.name
           OR l.class_pdf_url LIKE '%/content/' || storage.objects.name || '?%'
           OR l.class_pdf_url = 'storage://content/' || storage.objects.name
      )
        AND (c.price IS NULL OR c.price = 0)
    )
    -- Library materials — matches current app behaviour where any signed-in
    -- user can browse the library. Tighten later if paid.
    OR EXISTS (
      SELECT 1
      FROM public.materials m
      WHERE m.file_url LIKE '%/content/' || storage.objects.name
         OR m.file_url LIKE '%/content/' || storage.objects.name || '?%'
         OR m.file_url = 'storage://content/' || storage.objects.name
    )
    -- Library notes — same treatment as materials.
    OR EXISTS (
      SELECT 1
      FROM public.notes n
      WHERE n.pdf_url LIKE '%/content/' || storage.objects.name
         OR n.pdf_url LIKE '%/content/' || storage.objects.name || '?%'
         OR n.pdf_url = 'storage://content/' || storage.objects.name
    )
    -- Quiz question images — quiz gating happens at the questions/quiz_attempts
    -- RLS layer; here we only require the image is referenced by some question.
    OR EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.image_url LIKE '%/content/' || storage.objects.name
         OR q.image_url LIKE '%/content/' || storage.objects.name || '?%'
         OR q.image_url = 'storage://content/' || storage.objects.name
    )
  )
);

-- Speed up the storage:// exact-match branch of each EXISTS.
CREATE INDEX IF NOT EXISTS lessons_class_pdf_url_idx
  ON public.lessons (class_pdf_url) WHERE class_pdf_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_file_url_idx
  ON public.materials (file_url) WHERE file_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_pdf_url_idx
  ON public.notes (pdf_url) WHERE pdf_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS questions_image_url_idx
  ON public.questions (image_url) WHERE image_url IS NOT NULL;