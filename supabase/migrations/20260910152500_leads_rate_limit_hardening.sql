-- Lead form spam hardening.
--
-- The permissive "Anyone can submit leads" policy allowed anon inserts, and
-- public.rate_limit_lead_insert() returns early when auth.uid() IS NULL — so
-- signed-out visitors could flood the table with unlimited fake leads.
-- LeadForm already requires sign-in, so drop the anon path entirely; the
-- self-bound authenticated policy plus the 5/hour trigger now actually apply.

DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;
REVOKE INSERT ON public.leads FROM anon;
GRANT INSERT ON public.leads TO authenticated;
