REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM anon;
-- authenticated retains EXECUTE (harmless — same aggregate counts).