-- Lesson/player/reader feature toggles are stored in site_settings, but the
-- key allowlist only contained a fixed legacy list, so saving any new
-- "Lesson Features" switch failed with site_settings_key_allowlist.
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_key_allowlist;

ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_key_allowlist CHECK (
  key = ANY (ARRAY[
    'whatsapp_url','instagram_url','twitter_url','facebook_url','telegram_url',
    'youtube_url','linkedin_url','discord_url','website_url','admin_email',
    'player_infinity_logo','player_youtube_mask','reader_zoom_controls'
  ])
  OR key ~ '^(lesson|player|reader|notes)_[a-z0-9_]{1,60}$'
);
