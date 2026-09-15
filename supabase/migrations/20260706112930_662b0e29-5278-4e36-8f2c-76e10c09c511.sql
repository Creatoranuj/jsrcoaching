-- Site settings: hide non-public keys from anonymous readers
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
-- All current keys are social URLs — safe to expose
UPDATE public.site_settings SET is_public = true;

DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;

CREATE POLICY "Anon reads only public site settings"
  ON public.site_settings FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "Authenticated reads all site settings"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON COLUMN public.site_settings.is_public IS
  'When true, key/value is readable by unauthenticated visitors. Default false so new admin-entered rows never accidentally leak.';

COMMENT ON TABLE public.app_config IS
  'Public by design: read anonymously for the pre-login force-update check (min_android_version, store URLs, update_message). Do NOT store secrets here.';