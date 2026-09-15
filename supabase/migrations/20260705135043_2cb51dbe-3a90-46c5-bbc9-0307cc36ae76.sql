-- Batch 3: rate_limits deny-all + explicit REVOKE/GRANT on SECURITY DEFINER fns

-- 1. rate_limits: written only via check_rate_limit() SECURITY DEFINER.
--    Add explicit deny-all so linter INFO 0008 (RLS enabled, no policy) clears.
DROP POLICY IF EXISTS "rate_limits_no_direct_access" ON public.rate_limits;
CREATE POLICY "rate_limits_no_direct_access"
  ON public.rate_limits
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.rate_limits IS
  'Written only via check_rate_limit()/check_rate_limit_text() SECURITY DEFINER functions. Direct access denied by RLS policy.';

-- 2. Lock down SECURITY DEFINER function EXECUTE grants.
--    Pattern: revoke from PUBLIC + anon, grant to the role that legitimately calls each.

-- Admin-only (must not be callable by anon at all; already gated internally too)
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_profiles_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.process_refund(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_refund(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) TO service_role;

-- Signed-in-user surfaces (must be revoked from anon)
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_book_clicks(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.increment_book_clicks(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) TO authenticated;

-- Intentionally public reads (landing page stats + course browse + search)
-- Keep anon EXECUTE, but re-declare so linter sees an explicit grant chain.
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;
COMMENT ON FUNCTION public.get_platform_stats() IS
  'Intentionally public: powers landing-page counters. Read-only, aggregate counts only.';

REVOKE EXECUTE ON FUNCTION public.get_course_lesson_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_course_lesson_stats() TO anon, authenticated;
COMMENT ON FUNCTION public.get_course_lesson_stats() IS
  'Intentionally public: powers course cards. Aggregate counts only, no lesson bodies.';

REVOKE EXECUTE ON FUNCTION public.search_lectures(text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.search_lectures(text, integer) TO anon, authenticated;
COMMENT ON FUNCTION public.search_lectures(text, integer) IS
  'Intentionally public: search over is_locked=false lessons only, filtered inside the function.';