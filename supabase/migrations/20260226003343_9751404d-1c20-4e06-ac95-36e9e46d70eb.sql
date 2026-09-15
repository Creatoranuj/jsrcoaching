
-- Tighten payment_requests INSERT: ensure user_id matches auth.uid()
DROP POLICY IF EXISTS "Allow users to create requests" ON public.payment_requests;
CREATE POLICY "Users can create own payment requests"
ON public.payment_requests FOR INSERT
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Tighten comments INSERT: ensure user_id matches auth.uid()
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
CREATE POLICY "Users can create own comments"
ON public.comments FOR INSERT
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Add leads access audit: create audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view audit logs"
ON public.audit_log FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit logs"
ON public.audit_log FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create function to audit leads access
CREATE OR REPLACE FUNCTION public.audit_leads_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, table_name, record_count)
  VALUES (auth.uid(), 'SELECT', 'leads', 1);
  RETURN NEW;
END;
$$;
