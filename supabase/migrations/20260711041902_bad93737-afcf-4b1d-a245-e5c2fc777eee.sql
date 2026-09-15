GRANT SELECT ON public.app_config TO anon;
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;

GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;