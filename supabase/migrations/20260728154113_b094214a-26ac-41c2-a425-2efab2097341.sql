-- Harden get_user_role: only self or admin may look up a role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized to read this user''s role';
  END IF;

  SELECT role INTO _result
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'admin'::app_role   THEN 1
    WHEN 'teacher'::app_role THEN 2
    WHEN 'student'::app_role THEN 3
    ELSE 4
  END
  LIMIT 1;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

-- get_course_lesson_stats needs no elevated privileges for clients; keep it server-side only
REVOKE ALL ON FUNCTION public.get_course_lesson_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats() TO service_role;