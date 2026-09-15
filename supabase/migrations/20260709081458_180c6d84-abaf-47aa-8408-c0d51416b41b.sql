-- ============================================================================
-- Phone OTP Login (MSG91-backed)
-- ============================================================================
-- Adds a phone_otps table for storing HASHED OTP codes with expiry + attempt
-- tracking. Never store plaintext OTPs. Rate limiting reuses existing
-- public.check_rate_limit() function.

CREATE TABLE IF NOT EXISTS public.phone_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,              -- SHA-256 hex of the 6-digit code
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GRANTs: this table is TOUCHED ONLY by edge functions using service_role.
-- Neither anon nor authenticated should read/write directly.
GRANT ALL ON public.phone_otps TO service_role;

ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated => zero client access (defense-in-depth).
-- service_role bypasses RLS.

CREATE INDEX IF NOT EXISTS phone_otps_phone_created_idx
  ON public.phone_otps (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS phone_otps_expires_idx
  ON public.phone_otps (expires_at)
  WHERE consumed_at IS NULL;

-- Cleanup: purge OTPs older than 1 day. Run manually or via pg_cron later.
CREATE OR REPLACE FUNCTION public.purge_expired_phone_otps()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.phone_otps
  WHERE created_at < now() - INTERVAL '1 day';
$$;