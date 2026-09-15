REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_book_clicks(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_book_clicks(uuid) TO authenticated;