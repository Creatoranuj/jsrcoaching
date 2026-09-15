-- Restore role checks for signed-in users (anon stays revoked)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

-- Landing page is public; restore anon access to aggregate stats
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon;
