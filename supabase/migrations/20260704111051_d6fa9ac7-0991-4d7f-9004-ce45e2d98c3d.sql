
-- ============================================================
-- SEC HARDENING: free-enrollment bypass on paid courses
-- Fixes CRITICAL #1, CRITICAL #2, HIGH #3, HIGH #4 from audit.
-- ============================================================

-- ── CRITICAL #1: fail-closed default on lessons.is_locked ──
ALTER TABLE public.lessons ALTER COLUMN is_locked SET DEFAULT true;

-- Backfill: every lesson in a paid course must be locked.
UPDATE public.lessons l
SET    is_locked = true
FROM   public.courses c
WHERE  l.course_id = c.id
  AND  c.price IS NOT NULL
  AND  c.price > 0
  AND  l.is_locked IS DISTINCT FROM true;

-- Any NULLs → treat as locked.
UPDATE public.lessons SET is_locked = true WHERE is_locked IS NULL;
ALTER TABLE public.lessons ALTER COLUMN is_locked SET NOT NULL;

-- ── HIGH #4: widen enrollments INSERT so free courses work ──
DROP POLICY IF EXISTS "Users can self-enroll only with verified payment" ON public.enrollments;

CREATE POLICY "Users self-enroll: free or paid-verified"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    -- Free course: any authenticated user may enroll.
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = enrollments.course_id
        AND (c.price IS NULL OR c.price = 0)
    )
    -- Paid course: must have a completed, non-refunded razorpay payment
    -- for this exact user + course.
    OR EXISTS (
      SELECT 1 FROM public.razorpay_payments rp
      WHERE rp.user_id = auth.uid()
        AND rp.course_id = enrollments.course_id
        AND rp.status = 'completed'
    )
  )
);

-- ── CRITICAL #2 + HIGH #3: tighten storage `content` bucket policy ──
-- Old policy: allowed access whenever ANY row in materials/notes/questions
-- referenced the file (no enrollment check) AND whenever course.price=0
-- (whole bucket leaked on a fat-finger price change).
-- New policy: every branch is scoped to enrollment / admin / teacher / free-with-enrollment.
DROP POLICY IF EXISTS "Enrolled users can read gated content" ON storage.objects;

CREATE POLICY "Enrolled users can read gated content"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'content'
  AND (
    -- Public UI assets remain open.
    COALESCE((storage.foldername(name))[1], '') = ANY (
      ARRAY['hero-banners', 'thumbnails', 'chapter-icons']
    )
    -- Admins / teachers always allowed.
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    -- Lesson references → require active enrollment on that lesson's course.
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.enrollments e ON e.course_id = l.course_id
      WHERE (
        l.class_pdf_url LIKE '%/content/' || objects.name
        OR l.class_pdf_url LIKE '%/content/' || objects.name || '?%'
        OR l.class_pdf_url = 'storage://content/' || objects.name
        OR l.video_url    LIKE '%/content/' || objects.name
        OR l.video_url    LIKE '%/content/' || objects.name || '?%'
        OR l.video_url    = 'storage://content/' || objects.name
      )
      AND e.user_id = auth.uid()
      AND e.status  = 'active'
    )
    -- Materials → require active enrollment via materials.course_id (or lesson_id → course_id).
    OR EXISTS (
      SELECT 1
      FROM public.materials m
      LEFT JOIN public.lessons ml ON ml.id = m.lesson_id
      JOIN public.enrollments e
        ON e.course_id = COALESCE(m.course_id, ml.course_id)
      WHERE (
        m.file_url LIKE '%/content/' || objects.name
        OR m.file_url LIKE '%/content/' || objects.name || '?%'
        OR m.file_url = 'storage://content/' || objects.name
      )
      AND e.user_id = auth.uid()
      AND e.status  = 'active'
    )
    -- Notes → require active enrollment via notes.lesson_id → course.
    OR EXISTS (
      SELECT 1
      FROM public.notes n
      JOIN public.lessons nl ON nl.id = n.lesson_id
      JOIN public.enrollments e ON e.course_id = nl.course_id
      WHERE (
        n.pdf_url LIKE '%/content/' || objects.name
        OR n.pdf_url LIKE '%/content/' || objects.name || '?%'
        OR n.pdf_url = 'storage://content/' || objects.name
      )
      AND e.user_id = auth.uid()
      AND e.status  = 'active'
    )
    -- Quiz question images → require active enrollment via quiz.course_id (or quiz.lesson_id → course).
    OR EXISTS (
      SELECT 1
      FROM public.questions q
      JOIN public.quizzes qz  ON qz.id = q.quiz_id
      LEFT JOIN public.lessons ql ON ql.id = qz.lesson_id
      JOIN public.enrollments e
        ON e.course_id = COALESCE(qz.course_id, ql.course_id)
      WHERE (
        q.image_url LIKE '%/content/' || objects.name
        OR q.image_url LIKE '%/content/' || objects.name || '?%'
        OR q.image_url = 'storage://content/' || objects.name
      )
      AND e.user_id = auth.uid()
      AND e.status  = 'active'
    )
  )
);
