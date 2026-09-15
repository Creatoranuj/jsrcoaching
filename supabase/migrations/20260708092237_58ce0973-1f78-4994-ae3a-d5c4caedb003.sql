
-- ── lecture_schedules ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view schedules" ON public.lecture_schedules;

CREATE POLICY "Enrolled users and staff can view schedules"
ON public.lecture_schedules FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = lecture_schedules.course_id
      AND e.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = lecture_schedules.course_id
      AND (c.price IS NULL OR c.price = 0)
  )
);

-- ── live_sessions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view live sessions" ON public.live_sessions;

CREATE POLICY "Enrolled users and staff can view live sessions"
ON public.live_sessions FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = live_sessions.course_id
      AND e.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = live_sessions.course_id
      AND (c.price IS NULL OR c.price = 0)
  )
);

-- ── notes ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view notes" ON public.notes;

CREATE POLICY "Enrolled users and staff can view notes"
ON public.notes FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.lessons l
    JOIN public.enrollments e ON e.course_id = l.course_id
    WHERE l.id = notes.lesson_id
      AND e.user_id = auth.uid()
      AND e.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = notes.lesson_id
      AND (c.price IS NULL OR c.price = 0)
  )
);
