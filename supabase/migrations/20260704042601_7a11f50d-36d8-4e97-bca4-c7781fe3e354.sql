-- Grant EXECUTE on SECURITY DEFINER role/enrollment helper RPCs to authenticated users.
-- Without these, the client receives "42501 permission denied for function ..." (403 via PostgREST)
-- and the Profile screen falls back to the cached "student" role even for admins.
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) TO authenticated, service_role;