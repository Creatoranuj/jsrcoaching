
-- Purge Razorpay test-mode payment data and related paid enrollments before switching to live keys.
-- Keeps free-course enrollments intact.

DELETE FROM public.enrollments
WHERE course_id IN (SELECT id FROM public.courses WHERE price > 0);

DELETE FROM public.razorpay_payments;
DELETE FROM public.payment_requests;
