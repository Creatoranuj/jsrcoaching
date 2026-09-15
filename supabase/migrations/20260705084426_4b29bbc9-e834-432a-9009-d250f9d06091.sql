ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS sentry_traces_sample_rate numeric NOT NULL DEFAULT 0.1
  CONSTRAINT app_config_sentry_traces_sample_rate_range CHECK (sentry_traces_sample_rate >= 0 AND sentry_traces_sample_rate <= 1);