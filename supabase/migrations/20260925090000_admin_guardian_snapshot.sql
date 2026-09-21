-- Backend Guardian: admin-only, read-only live proof of the security gates.
-- Applied 2026-09-21 on project wegamscqtvqhxowlskfm.
-- Mirrors the live function; safe to re-run (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.admin_guardian_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_rls_total int;
  v_rls_off jsonb;
  v_profiles_role boolean;
  v_enroll jsonb;
  v_roles_open int;
  v_public_buckets jsonb;
  v_bucket_total int;
  v_definer_nosp jsonb;
  v_regressions int;
  v_cron jsonb;
  v_tables jsonb;
  v_pay_completed int;
  v_pay_missing int;
  v_open_write jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_rls_total
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r';

  SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb) INTO v_rls_off
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) INTO v_profiles_role;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'name', policyname,
           'with_check', with_check,
           'admin_only', coalesce(with_check, qual, '') ILIKE '%has_role%',
           'checks_price', coalesce(with_check, '') ILIKE '%price%',
           'checks_payment', coalesce(with_check, '') ILIKE '%razorpay_payments%'
         ) ORDER BY policyname), '[]'::jsonb) INTO v_enroll
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'enrollments' AND cmd IN ('INSERT', 'ALL');

  SELECT count(*) INTO v_roles_open
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'user_roles'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND coalesce(with_check, qual, '') NOT ILIKE '%has_role%';

  SELECT count(*) INTO v_bucket_total FROM storage.buckets;

  SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_public_buckets
    FROM storage.buckets WHERE public;

  SELECT coalesce(jsonb_agg(p.proname ORDER BY p.proname), '[]'::jsonb) INTO v_definer_nosp
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND (p.proconfig IS NULL OR NOT EXISTS (
           SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'));

  SELECT coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'cmd', cmd)
           ORDER BY tablename, policyname), '[]'::jsonb) INTO v_open_write
    FROM pg_policies
   WHERE schemaname = 'public'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND btrim(coalesce(with_check, qual, '')) IN ('true', '(true)')
     -- service_role bypasses RLS anyway, so a permissive service_role-only
     -- policy is not an open door; exclude it to avoid a false alarm.
     AND NOT (roles <@ ARRAY['service_role']::name[]);

  BEGIN
    SELECT count(*) INTO v_regressions FROM public.audit_security_policies();
  EXCEPTION WHEN OTHERS THEN
    v_regressions := NULL;
  END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active)
             ORDER BY jobname), '[]'::jsonb) INTO v_cron
      FROM cron.job;
  EXCEPTION WHEN OTHERS THEN
    v_cron := NULL;
  END;

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_tables
    FROM (
      SELECT relname AS "table", n_live_tup AS "rows", pg_total_relation_size(relid) AS bytes
        FROM pg_stat_user_tables
       WHERE schemaname = 'public'
       ORDER BY pg_total_relation_size(relid) DESC
       LIMIT 8
    ) t;

  SELECT count(*) INTO v_pay_completed FROM public.razorpay_payments WHERE status = 'completed';
  SELECT count(*) INTO v_pay_missing
    FROM public.razorpay_payments rp
   WHERE rp.status = 'completed'
     AND NOT EXISTS (
       SELECT 1 FROM public.enrollments e
        WHERE e.user_id = rp.user_id AND e.course_id = rp.course_id);

  RETURN jsonb_build_object(
    'checked_at', now(),
    'rls', jsonb_build_object('total', v_rls_total, 'off', v_rls_off),
    'profiles_role_column', v_profiles_role,
    'enrollment_insert_policies', v_enroll,
    'user_roles_open_write_policies', v_roles_open,
    'buckets', jsonb_build_object('total', v_bucket_total, 'public', v_public_buckets),
    'definer_without_search_path', v_definer_nosp,
    'open_write_policies', v_open_write,
    'policy_regressions', v_regressions,
    'cron_jobs', v_cron,
    'top_tables', v_tables,
    'payments', jsonb_build_object('completed', v_pay_completed, 'missing_enrollment', v_pay_missing)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_guardian_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_guardian_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guardian_snapshot() TO service_role;

COMMENT ON FUNCTION public.admin_guardian_snapshot() IS
  'Backend Guardian: admin-only, read-only live proof of security gates, cron, payments reconciliation and largest tables. Used by /admin/guardian.';