-- Lock down sensitive SECURITY DEFINER functions: remove EXECUTE from anon/authenticated
-- These must only be called by edge functions using service_role.
REVOKE EXECUTE ON FUNCTION public.process_refund(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_refund(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) TO service_role;

-- Document intentional admin-self-checked functions (silences scanner noise)
COMMENT ON FUNCTION public.admin_get_suspicious_enrollments(integer) IS 'EXECUTE to authenticated intentional; enforces has_role(auth.uid(),''admin'') inside.';
COMMENT ON FUNCTION public.admin_get_user_snapshot(uuid) IS 'EXECUTE to authenticated intentional; enforces has_role(auth.uid(),''admin'') inside.';
COMMENT ON FUNCTION public.admin_hide_content(text, uuid, boolean, text) IS 'EXECUTE to authenticated intentional; enforces has_role(auth.uid(),''admin'') inside.';
COMMENT ON FUNCTION public.admin_mark_enrollment_legit(bigint, text) IS 'EXECUTE to authenticated intentional; enforces has_role(auth.uid(),''admin'') inside.';
COMMENT ON FUNCTION public.admin_resolve_report(uuid, text) IS 'EXECUTE to authenticated intentional; enforces has_role(auth.uid(),''admin'') inside.';
COMMENT ON FUNCTION public.admin_revoke_enrollment(bigint, text) IS 'EXECUTE to authenticated intentional; enforces has_role(auth.uid(),''admin'') inside.';
COMMENT ON FUNCTION public.admin_set_user_block(uuid, boolean, text) IS 'EXECUTE to authenticated intentional; enforces has_role(auth.uid(),''admin'') inside.';