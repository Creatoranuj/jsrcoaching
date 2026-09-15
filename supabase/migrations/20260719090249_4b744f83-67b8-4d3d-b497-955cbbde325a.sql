
-- Lock down EXECUTE on SECURITY DEFINER functions in public.
-- Default CREATE FUNCTION grants EXECUTE to PUBLIC, which lets anon and authenticated
-- call every SECURITY DEFINER function directly. Revoke that blanket access and
-- re-grant EXECUTE only on the functions clients are meant to call.

-- 1) Revoke EXECUTE from PUBLIC (covers anon + authenticated) on every function in public.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Re-grant EXECUTE to authenticated only on the RPCs the client legitimately calls.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_admin() TO authenticated;
