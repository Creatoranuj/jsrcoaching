-- Internal/RLS-only helpers: revoke from anon + authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC, anon, authenticated;

-- Trigger-only helpers: fully revoke (triggers fire as table owner, not via EXECUTE grant)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_lesson_like_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_preferences_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_student_notes_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_books_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_doubt_sessions_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_hero_banners_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_knowledge_base_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_admin_on_signup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_leads_access() FROM PUBLIC, anon, authenticated;

-- App-facing functions: authenticated only, no anon
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_profiles_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_lectures(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_lectures(text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_book_clicks(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.increment_book_clicks(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;
