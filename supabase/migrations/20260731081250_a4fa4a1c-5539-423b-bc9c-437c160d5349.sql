DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.user_roles;
DROP TRIGGER IF EXISTS trg_guard_enrollment_update ON public.enrollments;
REVOKE ALL ON FUNCTION public.enforce_enrollment_payment() FROM PUBLIC, anon, authenticated;