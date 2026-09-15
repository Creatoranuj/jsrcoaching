
-- Create site_settings table for social media links and other key-value settings
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Public can read
CREATE POLICY "Anyone can view site settings"
  ON public.site_settings
  FOR SELECT
  USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage site settings"
  ON public.site_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Pre-populate social media keys
INSERT INTO public.site_settings (key, value) VALUES
  ('whatsapp_url', ''),
  ('telegram_url', ''),
  ('instagram_url', ''),
  ('twitter_url', ''),
  ('youtube_url', ''),
  ('facebook_url', '');
