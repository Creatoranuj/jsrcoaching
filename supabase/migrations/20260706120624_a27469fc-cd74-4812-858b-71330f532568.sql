-- comments: gate by lesson -> course enrollment
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
CREATE POLICY "Enrolled users and staff can view comments"
  ON public.comments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.enrollments e
        ON e.course_id = l.course_id
       AND e.user_id = auth.uid()
       AND e.status = 'active'
      WHERE l.id = comments.lesson_id
    )
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = comments.lesson_id
        AND (c.price IS NULL OR c.price = 0)
    )
  );

-- lesson_ratings: same gate
DROP POLICY IF EXISTS "Authenticated can read lesson ratings" ON public.lesson_ratings;
CREATE POLICY "Enrolled users and staff can read lesson ratings"
  ON public.lesson_ratings FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.enrollments e
        ON e.course_id = l.course_id
       AND e.user_id = auth.uid()
       AND e.status = 'active'
      WHERE l.id = lesson_ratings.lesson_id
    )
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = lesson_ratings.lesson_id
        AND (c.price IS NULL OR c.price = 0)
    )
  );

-- timetable: gate by course_id enrollment
DROP POLICY IF EXISTS "Anyone authenticated can view timetable" ON public.timetable;
CREATE POLICY "Enrolled users and staff can view timetable"
  ON public.timetable FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.course_id = timetable.course_id
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = timetable.course_id
        AND (c.price IS NULL OR c.price = 0)
    )
  );

-- syllabus: gate by course_id enrollment
DROP POLICY IF EXISTS "Anyone can view syllabus" ON public.syllabus;
CREATE POLICY "Enrolled users and staff can view syllabus"
  ON public.syllabus FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.course_id = syllabus.course_id
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = syllabus.course_id
        AND (c.price IS NULL OR c.price = 0)
    )
  );