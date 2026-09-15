
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_students', (SELECT count(*) FROM public.profiles),
    'total_courses',  (SELECT count(*) FROM public.courses),
    'total_teachers', (SELECT count(*) FROM public.user_roles WHERE role = 'teacher')
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;
