-- ============================================================
-- 1) Comment-images: require course access (owner / staff / enrolled / free)
-- ============================================================
DROP POLICY IF EXISTS "Read comment-images if owner or attached to a comment" ON storage.objects;

CREATE POLICY "Read comment-images if owner, staff, or enrolled"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comment-images'
    AND (
      -- The uploader can always see their own files
      (auth.uid())::text = (storage.foldername(name))[1]
      -- Admins and teachers can see everything
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'teacher'::app_role)
      -- Attached to a comment on a lesson the caller can access
      OR EXISTS (
        SELECT 1
        FROM public.comments c
        JOIN public.lessons  l ON l.id = c.lesson_id
        LEFT JOIN public.courses c2 ON c2.id = l.course_id
        LEFT JOIN public.enrollments e
               ON e.course_id = l.course_id
              AND e.user_id   = auth.uid()
              AND e.status    = 'active'
        WHERE c.image_url IS NOT NULL
          AND c.image_url = ('comment-images/' || storage.objects.name)
          AND (
            e.id IS NOT NULL
            OR c2.price IS NULL
            OR c2.price = 0
          )
      )
    )
  );

-- ============================================================
-- 2) Tighten SECURITY DEFINER EXECUTE grants
--    - Revoke default PUBLIC/anon/authenticated EXECUTE on every
--      SECURITY DEFINER function in the public schema.
--    - Re-grant only to the specific roles that need each fn.
-- ============================================================
DO $$
DECLARE
  r record;
  auth_whitelist text[] := ARRAY[
    'admin_get_suspicious_enrollments',
    'admin_get_user_snapshot',
    'admin_hide_content',
    'admin_mark_enrollment_legit',
    'admin_resolve_report',
    'admin_revoke_enrollment',
    'admin_set_user_block',
    'audit_security_policies',
    'check_rate_limit',
    'check_rate_limit_text',
    'complete_paid_enrollment',
    'get_course_bundle',
    'get_course_lesson_stats',
    'get_dashboard_snapshot',
    'get_quiz_questions',
    'get_quiz_review',
    'get_user_profiles_admin',
    'get_user_role',
    'has_role',
    'increment_book_clicks',
    'match_knowledge',
    'process_refund',
    'search_lectures',
    'verify_enrollment_for_attendance'
  ];
  anon_whitelist text[] := ARRAY[
    'search_lectures',
    'get_platform_stats'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      r.proname, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.proname, r.args
    );
    IF r.proname = ANY(auth_whitelist) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        r.proname, r.args
      );
    END IF;
    IF r.proname = ANY(anon_whitelist) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
        r.proname, r.args
      );
    END IF;
  END LOOP;
END $$;