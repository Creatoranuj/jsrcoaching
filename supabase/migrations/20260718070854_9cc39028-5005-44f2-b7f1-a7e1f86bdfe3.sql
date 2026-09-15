ALTER TABLE public.razorpay_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_payments_user_course_idem_key
  ON public.razorpay_payments(user_id, course_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;