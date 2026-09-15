-- 1) lesson_chapters: gate by enrollment / free course via parent lesson
DROP POLICY IF EXISTS "Authenticated can read lesson chapters" ON public.lesson_chapters;
CREATE POLICY "Enrolled users and staff can view lesson chapters"
ON public.lesson_chapters FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lesson_chapters.lesson_id
      AND (
        EXISTS (SELECT 1 FROM public.enrollments e
                 WHERE e.user_id = auth.uid() AND e.course_id = l.course_id AND e.status = 'active')
        OR EXISTS (SELECT 1 FROM public.courses c
                    WHERE c.id = l.course_id AND (c.price IS NULL OR c.price = 0))
      )
  )
);

-- 2) lesson_quiz_markers: same gating
DROP POLICY IF EXISTS "Authenticated can read quiz markers" ON public.lesson_quiz_markers;
CREATE POLICY "Enrolled users and staff can view quiz markers"
ON public.lesson_quiz_markers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lesson_quiz_markers.lesson_id
      AND (
        EXISTS (SELECT 1 FROM public.enrollments e
                 WHERE e.user_id = auth.uid() AND e.course_id = l.course_id AND e.status = 'active')
        OR EXISTS (SELECT 1 FROM public.courses c
                    WHERE c.id = l.course_id AND (c.price IS NULL OR c.price = 0))
      )
  )
);

-- 3) syllabus: gate by enrollment / free course
DROP POLICY IF EXISTS "Anyone can view syllabus" ON public.syllabus;
CREATE POLICY "Enrolled users and staff can view syllabus"
ON public.syllabus FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (SELECT 1 FROM public.enrollments e
              WHERE e.user_id = auth.uid() AND e.course_id = syllabus.course_id AND e.status = 'active')
  OR EXISTS (SELECT 1 FROM public.courses c
              WHERE c.id = syllabus.course_id AND (c.price IS NULL OR c.price = 0))
);

-- 4) SECURITY DEFINER hardening: add in-function authorization checks
CREATE OR REPLACE FUNCTION public.get_quiz_questions(_quiz_id uuid)
 RETURNS TABLE(id uuid, quiz_id uuid, question_text text, question_type text, options jsonb, marks integer, negative_marks integer, order_index integer, image_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _course_id bigint;
  _published boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT q.course_id, q.is_published INTO _course_id, _published
    FROM public.quizzes q WHERE q.id = _quiz_id;

  IF _course_id IS NULL AND _published IS NULL THEN
    RAISE EXCEPTION 'Quiz not found' USING ERRCODE = '42704';
  END IF;

  IF NOT (
       public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'teacher'::app_role)
    OR (
      COALESCE(_published, false)
      AND (
        _course_id IS NULL
        OR EXISTS (SELECT 1 FROM public.enrollments e
                    WHERE e.user_id = _uid AND e.course_id = _course_id AND e.status = 'active')
        OR EXISTS (SELECT 1 FROM public.courses c
                    WHERE c.id = _course_id AND (c.price IS NULL OR c.price = 0))
      )
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT q.id, q.quiz_id, q.question_text, q.question_type,
           q.options, q.marks, q.negative_marks, q.order_index, q.image_url
      FROM public.questions q
     WHERE q.quiz_id = _quiz_id
     ORDER BY q.order_index;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_lectures(_query text, _limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, description text, course_id bigint, chapter_id uuid, lecture_type text, thumbnail_url text, rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, l.title, l.description, l.course_id, l.chapter_id,
         l.lecture_type, l.thumbnail_url,
         GREATEST(similarity(l.title, _query),
                  similarity(COALESCE(l.description, ''), _query) * 0.6) AS rank
  FROM public.lessons l
  WHERE (l.is_locked IS DISTINCT FROM TRUE)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'teacher'::app_role)
      OR EXISTS (SELECT 1 FROM public.enrollments e
                  WHERE e.user_id = auth.uid() AND e.course_id = l.course_id AND e.status = 'active')
      OR EXISTS (SELECT 1 FROM public.courses c
                  WHERE c.id = l.course_id AND (c.price IS NULL OR c.price = 0))
    )
    AND (
      l.title ILIKE '%' || _query || '%'
      OR l.description ILIKE '%' || _query || '%'
      OR similarity(l.title, _query) > 0.2
    )
  ORDER BY rank DESC, l.created_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 50));
END;
$function$;