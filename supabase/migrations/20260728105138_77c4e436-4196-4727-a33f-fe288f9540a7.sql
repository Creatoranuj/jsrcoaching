CREATE OR REPLACE FUNCTION public.complete_paid_enrollment(_user_id uuid, _course_id bigint, _razorpay_order_id text, _razorpay_payment_id text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _payment_id uuid;
  _enrollment_id bigint;
BEGIN
  SELECT id INTO _payment_id
  FROM public.razorpay_payments
  WHERE razorpay_order_id = _razorpay_order_id
    AND user_id = _user_id
    AND course_id = _course_id
  FOR UPDATE;

  IF _payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for order/user/course' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.razorpay_payments
     SET razorpay_payment_id = _razorpay_payment_id,
         status = 'completed',
         updated_at = now()
   WHERE id = _payment_id;

  INSERT INTO public.enrollments (user_id, course_id, status, purchased_at)
  VALUES (_user_id, _course_id, 'active', now())
  ON CONFLICT (user_id, course_id) DO UPDATE
    SET status = 'active',
        purchased_at = COALESCE(public.enrollments.purchased_at, EXCLUDED.purchased_at)
  RETURNING id INTO _enrollment_id;

  INSERT INTO public.audit_log (user_id, action, table_name, record_count)
  VALUES (_user_id, 'enrollment_completed', 'enrollments', 1);

  RETURN _enrollment_id;
END;
$function$;