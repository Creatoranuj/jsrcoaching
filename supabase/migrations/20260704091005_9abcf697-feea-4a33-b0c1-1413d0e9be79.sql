
-- Tighten EXECUTE grants on SECURITY DEFINER functions.
-- Trigger-only fns: revoke from PUBLIC + anon + authenticated (only postgres/triggers invoke them).
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_lesson_like_count()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_preferences_updated_at()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_student_notes_updated_at()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_books_updated_at()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_doubt_sessions_updated_at()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_hero_banners_updated_at()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_knowledge_base_updated_at()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_lesson_pdfs_updated_at()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_enrollment_status_tampering()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_leads_access()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_payment_request_amount()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_payment_request_actor()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_security_policies()              FROM PUBLIC, anon, authenticated;

-- Signed-in-only fns: revoke anon, keep authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_book_clicks(uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_course_lesson_stats()                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_admin()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_book_clicks(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats()                   TO authenticated;

-- Public-facing fns (landing page + lecture search): keep anon + authenticated.
GRANT EXECUTE ON FUNCTION public.get_platform_stats()                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer)              TO anon, authenticated;
