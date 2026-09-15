
CREATE TABLE IF NOT EXISTS public.app_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_android_version text NOT NULL DEFAULT '1.0.0',
  min_ios_version text NOT NULL DEFAULT '1.0.0',
  android_store_url text DEFAULT 'https://naveenbharat.vercel.app/install',
  ios_store_url text DEFAULT 'https://naveenbharat.vercel.app/install',
  update_message text NOT NULL DEFAULT 'A critical update is available. Please update to continue learning.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config readable by everyone"
  ON public.app_config FOR SELECT
  USING (true);

CREATE POLICY "app_config updatable by admins"
  ON public.app_config FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "app_config insertable by admins"
  ON public.app_config FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
