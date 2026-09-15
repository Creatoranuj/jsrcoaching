CREATE TABLE public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins can view alerts"
  ON public.security_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));