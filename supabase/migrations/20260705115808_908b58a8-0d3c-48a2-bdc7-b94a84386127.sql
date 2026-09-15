-- Lock down SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated/PUBLIC
-- on functions that are only used internally (as triggers, in RLS policies, or by edge
-- functions running with service_role). Client-callable RPCs retain their grants.

-- Trigger-only functions
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_preferences_updated_at()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_student_notes_updated_at()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_books_updated_at()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_doubt_sessions_updated_at()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_hero_banners_updated_at()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_knowledge_base_updated_at()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_lesson_like_count()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_lesson_pdfs_updated_at()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_enrollment_status_tampering()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_leads_access()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_payment_request_actor()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_payment_request_amount()        FROM PUBLIC, anon, authenticated;

-- RLS-helper (used inside policies; SECURITY DEFINER lets policies see them regardless of EXECUTE grant)
REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC, anon, authenticated;

-- Edge-function-only (invoked with service_role)
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, integer, integer)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_refund(text)                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_security_policies()                               FROM PUBLIC, anon, authenticated;

-- Public/anon-callable RPCs: tighten to authenticated only where signed-in is required
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_book_clicks(uuid)              FROM PUBLIC, anon;
-- get_platform_stats, search_lectures, get_course_lesson_stats, has_role, get_user_role
-- keep grants intact (called from client / anon-safe RLS helpers).
