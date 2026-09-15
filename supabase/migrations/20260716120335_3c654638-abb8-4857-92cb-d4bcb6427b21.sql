COMMENT ON TABLE public.phone_otps IS 'Server-only. Written/read exclusively by send-phone-otp / verify-phone-otp edge functions via service_role. Intentionally has no RLS policies — do NOT add a client-side policy. See docs/audit/pr5-post-ship-audit.md.';

REVOKE ALL ON public.phone_otps FROM anon, authenticated;
GRANT ALL ON public.phone_otps TO service_role;