
-- 1. Add metadata column (safe, additive)
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 2. Rewrite complete_paid_enrollment to write audit trail
CREATE OR REPLACE FUNCTION public.complete_paid_enrollment(
  _user_id uuid,
  _course_id bigint,
  _razorpay_order_id text,
  _razorpay_payment_id text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _payment_id bigint;
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

  -- Audit trail
  INSERT INTO public.audit_log (user_id, action, table_name, record_count, metadata)
  VALUES (
    _user_id,
    'enrollment_completed',
    'enrollments',
    1,
    jsonb_build_object(
      'course_id', _course_id,
      'enrollment_id', _enrollment_id,
      'razorpay_order_id', _razorpay_order_id,
      'razorpay_payment_id', _razorpay_payment_id
    )
  );

  RETURN _enrollment_id;
END;
$function$;

-- 3. Rewrite process_refund to write audit trail
CREATE OR REPLACE FUNCTION public.process_refund(_razorpay_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid;
  _cid bigint;
BEGIN
  UPDATE public.razorpay_payments
     SET status = 'refunded',
         updated_at = now()
   WHERE razorpay_order_id = _razorpay_order_id
   RETURNING user_id, course_id INTO _uid, _cid;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for order' USING ERRCODE = 'P0002';
  END IF;

  IF _cid IS NOT NULL THEN
    UPDATE public.enrollments
       SET status = 'refunded'
     WHERE user_id = _uid AND course_id = _cid;
  END IF;

  -- Audit trail
  INSERT INTO public.audit_log (user_id, action, table_name, record_count, metadata)
  VALUES (
    _uid,
    'refund_processed',
    'razorpay_payments',
    1,
    jsonb_build_object(
      'course_id', _cid,
      'razorpay_order_id', _razorpay_order_id,
      'actor', auth.uid()
    )
  );

  RETURN jsonb_build_object('user_id', _uid, 'course_id', _cid);
END;
$function$;
