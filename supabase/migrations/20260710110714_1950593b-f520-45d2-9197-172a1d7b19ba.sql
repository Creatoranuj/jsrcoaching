-- Revoke anon SELECT on sensitive tables. RLS already denies rows to anon
-- but the schema-level GRANT was an unnecessary attack-surface footgun.
REVOKE SELECT ON public.audit_log         FROM anon;
REVOKE SELECT ON public.security_events   FROM anon;
REVOKE SELECT ON public.security_alerts   FROM anon;
REVOKE SELECT ON public.razorpay_payments FROM anon;
REVOKE SELECT ON public.payment_events    FROM anon;
REVOKE SELECT ON public.payment_requests  FROM anon;
REVOKE SELECT ON public.deletion_requests FROM anon;
REVOKE SELECT ON public.user_sessions     FROM anon;
REVOKE SELECT ON public.user_subscriptions FROM anon;
REVOKE SELECT ON public.user_roles        FROM anon;
REVOKE SELECT ON public.profiles          FROM anon;
REVOKE SELECT ON public.enrollments       FROM anon;