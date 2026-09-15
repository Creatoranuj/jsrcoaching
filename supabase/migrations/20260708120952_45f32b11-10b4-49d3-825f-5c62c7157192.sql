INSERT INTO public.site_settings (key, value)
VALUES
  ('telegram_url', 'https://t.me/safarenglishka'),
  ('youtube_url', 'https://youtube.com/@safarenglishka')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;