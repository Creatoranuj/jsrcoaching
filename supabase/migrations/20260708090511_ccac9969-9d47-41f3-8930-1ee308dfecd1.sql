
-- One-shot: revoke anon + PUBLIC EXECUTE on every SECURITY DEFINER function
-- in the public schema, then re-grant only the intentionally-public ones.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS fn_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, PUBLIC',
      r.schema_name, r.fn_name, r.args
    );
  END LOOP;
END $$;

-- Landing page platform stats — intentionally callable by anon.
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;
