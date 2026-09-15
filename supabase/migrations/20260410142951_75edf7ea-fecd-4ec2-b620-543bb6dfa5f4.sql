-- Step 1: Remove dangerous client-side INSERT policy (prevents payment record poisoning)
DROP POLICY IF EXISTS "Users can insert own razorpay payments" ON public.razorpay_payments;

-- Step 2: Remove redundant admin SELECT policy (ALL policy already covers SELECT)
DROP POLICY IF EXISTS "Admins view all payments" ON public.razorpay_payments;