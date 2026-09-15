-- 1) Revoke anon SELECT from sensitive tables (phone_otps must never be readable by anon)
REVOKE SELECT ON public.phone_otps FROM anon;

-- 2) Revoke authenticated SELECT from admin-only / server-only tables.
--    RLS already blocks reads, but this removes them from the anon+auth GraphQL
--    discovery surface (linter 0026/0027) and enforces defense-in-depth.
REVOKE SELECT ON public.audit_log            FROM authenticated;
REVOKE SELECT ON public.security_alerts      FROM authenticated;
REVOKE SELECT ON public.security_events      FROM authenticated;
REVOKE SELECT ON public.error_logs           FROM authenticated;
REVOKE SELECT ON public.rate_limits          FROM authenticated;
REVOKE SELECT ON public.webhook_events       FROM authenticated;
REVOKE SELECT ON public.payment_events       FROM authenticated;
REVOKE SELECT ON public.pdf_proxy_metrics    FROM authenticated;
REVOKE SELECT ON public.crawl_history        FROM authenticated;
REVOKE SELECT ON public.dependency_scan_reports FROM authenticated;
REVOKE SELECT ON public.trusted_hosts        FROM authenticated;
REVOKE SELECT ON public.app_config           FROM authenticated;
REVOKE SELECT ON public.meta_ad_config       FROM authenticated;
REVOKE SELECT ON public.automation_rules     FROM authenticated;
REVOKE SELECT ON public.marketing_campaigns  FROM authenticated;
REVOKE SELECT ON public.funnel_entries       FROM authenticated;
REVOKE SELECT ON public.funnel_stages        FROM authenticated;
REVOKE SELECT ON public.leads                FROM authenticated;
REVOKE SELECT ON public.earning_links        FROM authenticated;
REVOKE SELECT ON public.deletion_requests    FROM authenticated;
REVOKE SELECT ON public.chatbot_settings     FROM authenticated;
REVOKE SELECT ON public.chatbot_logs         FROM authenticated;
REVOKE SELECT ON public.phone_otps           FROM authenticated;

-- Keep service_role full access (already granted); admin UIs go through
-- SECURITY DEFINER RPCs (e.g. get_user_profiles_admin) or edge functions.

-- 3) Tighten public-bucket listing (linter 0025). Public URLs still resolve
--    directly; only directory listing via storage.objects SELECT is removed.
DROP POLICY IF EXISTS "Authenticated can list content"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list notices"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list book-covers" ON storage.objects;
DROP POLICY IF EXISTS "auth list book-covers"              ON storage.objects;
DROP POLICY IF EXISTS "auth list notices"                  ON storage.objects;
-- Admin listing policies (Admins list content 2, Admins can manage *) remain.
