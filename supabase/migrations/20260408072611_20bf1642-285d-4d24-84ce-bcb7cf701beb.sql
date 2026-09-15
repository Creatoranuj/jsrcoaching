ALTER TABLE public.razorpay_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payments"
ON public.razorpay_payments FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all payments"
ON public.razorpay_payments FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));