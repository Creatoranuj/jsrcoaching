-- Phase 3.4 — tighten EXECUTE on internal SECURITY DEFINER helpers.
-- These functions are only called by triggers or other SECURITY DEFINER code,
-- never directly from the frontend. Revoking from anon/authenticated removes
-- 8 scanner warnings without changing behaviour. PUBLIC is also revoked so
-- new roles don't pick the grant up by default.

REVOKE EXECUTE ON FUNCTION public.handle_new_user()                           FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role()                      FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_admin_on_signup()                    FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_leads_access()                        FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_escalation()              FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_lesson_like_count()                  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_user_preferences_updated_at()        FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_student_notes_updated_at()           FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_books_updated_at()                   FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_doubt_sessions_updated_at()          FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_hero_banners_updated_at()            FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_knowledge_base_updated_at()          FROM anon, authenticated, PUBLIC;