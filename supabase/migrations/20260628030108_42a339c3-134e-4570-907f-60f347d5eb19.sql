
-- 1. Idempotency key for create-razorpay-order
ALTER TABLE public.razorpay_payments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS razorpay_payments_user_course_idemp_uq
  ON public.razorpay_payments(user_id, course_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Payment events audit table
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id bigint,
  event_type text NOT NULL,        -- order_created | order_reused | verify_ok | verify_fail | cancelled | recovered | timeout
  razorpay_order_id text,
  razorpay_payment_id text,
  idempotency_key text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL    ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS payment_events_user_idx
  ON public.payment_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_order_idx
  ON public.payment_events(razorpay_order_id);
