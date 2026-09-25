-- Drift fix: supabase/migrations/20260705084426_*.sql and supabase/schema-package.sql
-- both declare app_config.sentry_traces_sample_rate, but the live database never
-- got it (the migration predates the BASELINE `package=` marker, so the drift
-- check skips it). src/lib/sentry.ts selects this column on every app boot, so
-- every cold start logged: column app_config.sentry_traces_sample_rate does not exist.
ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS sentry_traces_sample_rate numeric NOT NULL DEFAULT 0.1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.app_config'::regclass
      AND conname = 'app_config_sentry_traces_sample_rate_range'
  ) THEN
    ALTER TABLE public.app_config
      ADD CONSTRAINT app_config_sentry_traces_sample_rate_range
      CHECK (sentry_traces_sample_rate >= 0 AND sentry_traces_sample_rate <= 1);
  END IF;
END $$;