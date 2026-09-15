
-- ============================================================
-- 1) Function EXECUTE hardening
-- ============================================================

-- Trigger-only functions: nobody should call these directly via API
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'assign_admin_on_signup()',
    'audit_leads_access()',
    'enforce_message_recipient_readonly()',
    'enforce_not_blocked()',
    'enforce_user_name_from_profile()',
    'handle_new_user()',
    'handle_new_user_role()',
    'lock_submitted_quiz_attempt()',
    'prevent_enrollment_status_tampering()',
    'prevent_self_role_escalation()',
    'rate_limit_lead_insert()',
    'sanitize_quiz_attempt_insert()',
    'stamp_payment_request_actor()',
    'update_lesson_like_count()',
    'validate_payment_request_amount()',
    'purge_expired_phone_otps()'
  ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Admin-only RPCs: revoke from anon/PUBLIC, keep authenticated (admin check inside)
REVOKE EXECUTE ON FUNCTION public.admin_get_suspicious_enrollments(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_snapshot(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_hide_content(text, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_enrollment_legit(bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_enrollment(bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_block(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_refund(text) FROM PUBLIC, anon;

-- Authenticated-only RPCs (require login; internal auth checks)
REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_course_bundle(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_snapshot() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_review(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, integer, integer) FROM PUBLIC, anon;

-- has_role / is_user_blocked / get_user_role / user_can_access_live_session_topic
-- are called from RLS policies evaluated as the caller's role; both anon and
-- authenticated need EXECUTE for RLS to work. Leave as-is.
--
-- get_course_lesson_stats / get_platform_stats / search_lectures are intentionally
-- public (used on landing / marketing surfaces). Leave as-is.

-- ============================================================
-- 2) site_settings key allow-list (prevents future secret leaks)
-- ============================================================

ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_key_allowlist;
ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_key_allowlist
  CHECK (key IN (
    'whatsapp_url',
    'instagram_url',
    'twitter_url',
    'facebook_url',
    'telegram_url',
    'youtube_url',
    'linkedin_url',
    'discord_url',
    'website_url'
  ));

COMMENT ON TABLE public.site_settings IS
  'Public social/contact link key-value store. Anon-readable by design. Guarded by site_settings_key_allowlist CHECK — do NOT relax this constraint; secrets must never live here.';

COMMENT ON TABLE public.app_config IS
  'App version / update-nag configuration. Anon-readable by design (used by ForceUpdateGate before login). Never store secrets in this table.';
