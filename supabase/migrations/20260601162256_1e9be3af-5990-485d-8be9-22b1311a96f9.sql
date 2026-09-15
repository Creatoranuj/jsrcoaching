
CREATE TYPE public.trusted_host_category AS ENUM ('frame','image','media','website','script','connect');

CREATE TABLE public.trusted_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL,
  category public.trusted_host_category NOT NULL DEFAULT 'frame',
  label text,
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host, category)
);

GRANT SELECT ON public.trusted_hosts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.trusted_hosts TO authenticated;
GRANT ALL ON public.trusted_hosts TO service_role;

ALTER TABLE public.trusted_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trusted_hosts read all"
  ON public.trusted_hosts FOR SELECT
  USING (true);

CREATE POLICY "trusted_hosts admin insert"
  ON public.trusted_hosts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "trusted_hosts admin update"
  ON public.trusted_hosts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "trusted_hosts admin delete"
  ON public.trusted_hosts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trusted_hosts_set_updated_at
  BEFORE UPDATE ON public.trusted_hosts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with currently hard-coded hosts so admin sees existing allowlist
INSERT INTO public.trusted_hosts (host, category, label) VALUES
  ('storage-naveenbharat-recording.vercel.app','frame','Lecture Notes Storage'),
  ('github-storages-cdn.vercel.app','frame','Notes CDN'),
  ('docs.google.com','frame','Google Docs viewer'),
  ('docs.googleusercontent.com','frame','Google Docs assets'),
  ('drive.google.com','frame','Google Drive'),
  ('www.youtube.com','frame','YouTube'),
  ('www.youtube-nocookie.com','frame','YouTube (no-cookie)'),
  ('archive.org','frame','Internet Archive')
ON CONFLICT (host, category) DO NOTHING;
