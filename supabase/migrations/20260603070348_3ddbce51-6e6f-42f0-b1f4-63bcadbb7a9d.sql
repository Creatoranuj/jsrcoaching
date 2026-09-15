
-- Fix 1: Find tables with RLS enabled but no policies, add a default deny policy
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY "deny_all_default" ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      r.table_name
    );
  END LOOP;
END $$;

-- Fix 2: Revoke public/anon EXECUTE on SECURITY DEFINER functions
-- These functions either require an authenticated session or have internal
-- authorization checks; anon should never invoke them directly.
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_lectures(text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_book_clicks(uuid) FROM anon, PUBLIC;

-- get_user_profiles_admin should ONLY be callable internally (it already
-- has a has_role admin check, but no reason for non-admins to even attempt it
-- since it returns empty for them). Restrict to service_role only.
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM authenticated;
