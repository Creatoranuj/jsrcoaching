-- 1) Legacy users table (unused, stored password hashes)
DROP TABLE IF EXISTS public.users CASCADE;

-- 2) Remove blanket anon privileges on every public table
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','v','m','f')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;

-- Re-grant read access only where a policy intentionally allows anonymous reads
GRANT SELECT ON public.app_config TO anon;
GRANT SELECT ON public.books TO anon;
GRANT SELECT ON public.chapters TO anon;
GRANT SELECT ON public.chatbot_faq TO anon;
GRANT SELECT ON public.courses TO anon;
GRANT SELECT ON public.earning_links TO anon;
GRANT SELECT ON public.hero_banners TO anon;
GRANT SELECT ON public.knowledge_base TO anon;
GRANT SELECT ON public.landing_content TO anon;
GRANT SELECT ON public.landing_courses TO anon;
GRANT SELECT ON public.landing_testimonials TO anon;
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT ON public.site_stats TO anon;
GRANT SELECT ON public.subscription_plans TO anon;
-- public lead capture form
GRANT INSERT ON public.leads TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.leads_id_seq TO anon;

-- 3) System-only tables: not reachable by signed-in clients either
REVOKE ALL ON public.phone_otps FROM authenticated;
REVOKE ALL ON public.webhook_events FROM authenticated;
REVOKE ALL ON public.rate_limits FROM authenticated;

-- 4) Internal trigger / helper SECURITY DEFINER functions must not be directly callable
REVOKE ALL ON FUNCTION public.assign_admin_on_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_leads_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_not_blocked() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_user_name_from_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_enrollment_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_security_event_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_enrollment_status_tampering() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_student_doubt_teacher_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_lead_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_payment_request_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_lesson_like_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payment_request_amount() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_profiles_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

-- has_role / can_access_storage_course are used inside RLS + storage policies: keep callable
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_storage_course(text) TO anon, authenticated;

-- 5) Replace always-true INSERT policy on leads with an ownership-checked one
DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;
CREATE POLICY "Anyone can submit leads"
ON public.leads FOR INSERT TO anon, authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND char_length(email) BETWEEN 3 AND 200
  AND char_length(student_name) BETWEEN 1 AND 120
  AND char_length(grade) BETWEEN 1 AND 40
);