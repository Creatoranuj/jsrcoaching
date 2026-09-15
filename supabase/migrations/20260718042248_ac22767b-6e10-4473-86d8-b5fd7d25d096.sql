
DROP POLICY IF EXISTS "Anyone can read lesson chapters" ON public.lesson_chapters;
CREATE POLICY "Authenticated can read lesson chapters"
  ON public.lesson_chapters FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read quiz markers" ON public.lesson_quiz_markers;
CREATE POLICY "Authenticated can read quiz markers"
  ON public.lesson_quiz_markers FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.lesson_chapters FROM anon;
REVOKE SELECT ON public.lesson_quiz_markers FROM anon;

DROP POLICY IF EXISTS "Admins can manage syllabus" ON public.syllabus;

DROP POLICY IF EXISTS "Enrolled students or staff can read study material files" ON storage.objects;
CREATE POLICY "Enrolled students or staff can read study material files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'study-materials'
    AND length(coalesce(name, '')) > 0
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'teacher'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.study_materials sm
        JOIN public.enrollments e
          ON e.course_id = sm.course_id AND e.user_id = auth.uid()
        WHERE e.status = 'active'
          AND sm.kind <> 'link'
          AND sm.file_url = objects.name
      )
    )
  );

CREATE OR REPLACE FUNCTION public.validate_study_material_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kind NOT IN ('pdf','doc','image','link') THEN
    RAISE EXCEPTION 'Invalid kind: %', NEW.kind;
  END IF;
  IF NEW.kind = 'link' THEN
    IF NEW.external_url IS NULL OR length(btrim(NEW.external_url)) = 0 THEN
      RAISE EXCEPTION 'external_url required when kind = link';
    END IF;
  ELSE
    IF NEW.file_url IS NULL OR length(btrim(NEW.file_url)) = 0 THEN
      RAISE EXCEPTION 'file_url required when kind != link';
    END IF;
    IF NEW.file_url ~ '^(https?:|/|\.\.)' OR NEW.file_url LIKE '%..%' THEN
      RAISE EXCEPTION 'file_url must be a bare storage object key (no URL, leading slash, or traversal)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
  anon_wl text[] := ARRAY['search_lectures','get_platform_stats'];
  auth_wl text[] := ARRAY[
    'search_lectures','get_platform_stats','has_role','get_user_role',
    'get_user_profiles_admin','get_quiz_questions',
    'verify_enrollment_for_attendance','increment_book_clicks',
    'check_rate_limit','get_course_lesson_stats','get_course_bundle',
    'get_dashboard_snapshot','process_refund','audit_security_policies',
    'match_knowledge','complete_paid_enrollment'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
    IF r.proname = ANY(auth_wl) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                     r.proname, r.args);
    END IF;
    IF r.proname = ANY(anon_wl) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
                     r.proname, r.args);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                   r.proname, r.args);
  END LOOP;
END $$;
