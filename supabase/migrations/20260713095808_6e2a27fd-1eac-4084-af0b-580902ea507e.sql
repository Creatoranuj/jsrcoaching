REVOKE ALL ON FUNCTION public.get_dashboard_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO service_role;