INSERT INTO public.app_config (id, min_android_version, min_ios_version, android_store_url, ios_store_url, update_message, updated_at)
VALUES (
  1,
  '1.0.0',
  '1.0.0',
  NULL,
  NULL,
  'A new update is available for Sadguru Coaching Classes. Please update to get the latest features and fixes.',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  min_android_version = EXCLUDED.min_android_version,
  min_ios_version = EXCLUDED.min_ios_version,
  android_store_url = EXCLUDED.android_store_url,
  ios_store_url = EXCLUDED.ios_store_url,
  update_message = EXCLUDED.update_message,
  updated_at = now();