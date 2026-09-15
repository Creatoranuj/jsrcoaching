-- Fix 1: Add UNIQUE constraint on razorpay_order_id
ALTER TABLE public.razorpay_payments
  ADD CONSTRAINT razorpay_payments_order_id_unique UNIQUE (razorpay_order_id);

-- Fix 2: Remove duplicate RLS SELECT policy
DROP POLICY IF EXISTS "Users view own payments" ON public.razorpay_payments;