
-- 1. funnel_entries: Remove teacher access to lead PII
DROP POLICY IF EXISTS "Teachers view funnel_entries" ON public.funnel_entries;

-- 2. leads: Restrict INSERT to authenticated users only
DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;
CREATE POLICY "Authenticated users can submit leads"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (
    student_name IS NOT NULL
    AND email IS NOT NULL
    AND grade IS NOT NULL
  );

-- 3. profiles: Scope admin SELECT to authenticated role
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. audit_log: Scope policies to authenticated
DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_log;
CREATE POLICY "Only admins can view audit logs"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
CREATE POLICY "System can insert audit logs"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
