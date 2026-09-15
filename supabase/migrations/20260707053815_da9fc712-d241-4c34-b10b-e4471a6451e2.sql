-- 1) sub_payment_replay: idempotency guard on subscription payments.
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_payment_id_uidx
  ON public.user_subscriptions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 2) username_spoofing_open: bind user_name to the caller's own profile on write.
--    enforce_user_name_from_profile() already exists (SECURITY DEFINER) but was
--    never attached. It only overrides when NEW.user_id = auth.uid(), so admin /
--    service-role writes are untouched.
DROP TRIGGER IF EXISTS enforce_user_name_comments ON public.comments;
CREATE TRIGGER enforce_user_name_comments
  BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS enforce_user_name_community_comments ON public.community_comments;
CREATE TRIGGER enforce_user_name_community_comments
  BEFORE INSERT OR UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS enforce_user_name_live_messages ON public.live_messages;
CREATE TRIGGER enforce_user_name_live_messages
  BEFORE INSERT OR UPDATE ON public.live_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS enforce_user_name_live_participants ON public.live_participants;
CREATE TRIGGER enforce_user_name_live_participants
  BEFORE INSERT OR UPDATE ON public.live_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

-- 3) SUPA definer hardening: trigger functions never need direct EXECUTE.
--    Revoke the PUBLIC grant (which implicitly covers anon + authenticated).
--    Trigger firing is unaffected — triggers run in the definer context.
REVOKE EXECUTE ON FUNCTION public.enforce_user_name_from_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_submitted_quiz_attempt() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sanitize_quiz_attempt_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_leads_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_message_recipient_readonly() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_enrollment_status_tampering() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_limit_lead_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stamp_payment_request_actor() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_lesson_like_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_payment_request_amount() FROM PUBLIC;