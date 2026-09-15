CREATE INDEX IF NOT EXISTS idx_razorpay_payments_user_course_status
  ON public.razorpay_payments (user_id, course_id, status);