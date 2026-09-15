-- Payment / refund RPCs: webhook + service_role only.
REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.process_refund(text) FROM authenticated, anon, public;

-- Admin-only helper (has internal has_role check; belt + suspenders).
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM authenticated, anon, public;
GRANT  EXECUTE ON FUNCTION public.get_user_profiles_admin() TO service_role;

-- Trigger functions must not be callable by clients.
REVOKE EXECUTE ON FUNCTION public.enforce_message_recipient_readonly() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_lead_insert() FROM public, anon, authenticated;