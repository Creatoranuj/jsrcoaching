
CREATE TABLE public.dependency_scan_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  package_count INT NOT NULL DEFAULT 0,
  vulnerability_count INT NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  packages JSONB NOT NULL DEFAULT '[]'::jsonb
);

GRANT SELECT, INSERT ON public.dependency_scan_reports TO authenticated;
GRANT ALL ON public.dependency_scan_reports TO service_role;

ALTER TABLE public.dependency_scan_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view dependency scan reports"
  ON public.dependency_scan_reports
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert dependency scan reports"
  ON public.dependency_scan_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND scanned_by = auth.uid()
  );

CREATE INDEX idx_dependency_scan_reports_created_at
  ON public.dependency_scan_reports (created_at DESC);
