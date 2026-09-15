-- Lock down internal admin diagnostics
REVOKE ALL ON FUNCTION public.audit_security_policies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_security_policies() TO service_role;

-- Re-assert admin-only access for profile listing
REVOKE ALL ON FUNCTION public.get_user_profiles_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_admin() TO service_role;