-- Player & Reader Controls admin toggles
-- Adds an is_public flag to site_settings, widens the key allow-list,
-- and seeds the three new toggles with sensible defaults.

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Existing social/contact links are safe to expose to anonymous visitors
UPDATE public.site_settings
  SET is_public = true
  WHERE key IN (
    'whatsapp_url',
    'instagram_url',
    'twitter_url',
    'facebook_url',
    'telegram_url',
    'youtube_url',
    'linkedin_url',
    'discord_url',
    'website_url'
  );

-- Keep admin-only keys private
UPDATE public.site_settings
  SET is_public = false
  WHERE key = 'admin_email';

-- Widen the key allow-list so admins cannot accidentally add other keys
ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_key_allowlist;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_key_allowlist
  CHECK (key IN (
    'whatsapp_url',
    'instagram_url',
    'twitter_url',
    'facebook_url',
    'telegram_url',
    'youtube_url',
    'linkedin_url',
    'discord_url',
    'website_url',
    'admin_email',
    'player_infinity_logo',
    'player_youtube_mask',
    'reader_zoom_controls'
  ));

-- Seed the three new toggles
INSERT INTO public.site_settings (key, value, is_public)
VALUES
  ('player_infinity_logo', 'true', true),
  ('player_youtube_mask', 'true', true),
  ('reader_zoom_controls', 'false', true)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      is_public = EXCLUDED.is_public;
