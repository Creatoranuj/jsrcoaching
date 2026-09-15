
CREATE TABLE IF NOT EXISTS public.razorpay_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id bigint NOT NULL,
  razorpay_order_id text NOT NULL,
  razorpay_payment_id text,
  amount decimal(10,2) NOT NULL,
  currency text DEFAULT 'INR',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.razorpay_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own razorpay payments"
  ON public.razorpay_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own razorpay payments"
  ON public.razorpay_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all razorpay payments"
  ON public.razorpay_payments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_razorpay_payments_user_id ON public.razorpay_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_course_id ON public.razorpay_payments(course_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_order_id ON public.razorpay_payments(razorpay_order_id);
