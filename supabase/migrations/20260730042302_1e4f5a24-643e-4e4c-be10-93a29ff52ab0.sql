CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket text, _user_id uuid, _max integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_count integer;
BEGIN
  IF _user_id IS NULL THEN RETURN true; END IF;
  v_window := to_timestamp(floor(extract(epoch from now()) / GREATEST(_window_seconds, 1)) * GREATEST(_window_seconds, 1));

  INSERT INTO public.rate_limits (bucket, user_id, window_start, count)
  VALUES (_bucket, _user_id, v_window, 1)
  ON CONFLICT (bucket, user_id, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  DELETE FROM public.rate_limits
   WHERE window_start < now() - interval '1 day';

  RETURN v_count <= GREATEST(_max, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.process_refund(_razorpay_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_course bigint;
BEGIN
  UPDATE public.razorpay_payments
     SET status = 'refunded', updated_at = now()
   WHERE razorpay_order_id = _razorpay_order_id
   RETURNING user_id, course_id INTO v_user, v_course;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'payment not found for order %', _razorpay_order_id;
  END IF;

  UPDATE public.enrollments
     SET status = 'refunded'
   WHERE user_id = v_user AND course_id = v_course;

  INSERT INTO public.audit_log (actor_id, user_id, action, table_name, entity_type, entity_id, record_count, metadata)
  VALUES (NULL, v_user, 'refund_processed', 'razorpay_payments', 'payment', v_user, 1,
          jsonb_build_object('razorpay_order_id', _razorpay_order_id, 'course_id', v_course));
END;
$$;

REVOKE ALL ON FUNCTION public.process_refund(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(text) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS razorpay_payments_user_course_idem_uniq
  ON public.razorpay_payments (user_id, course_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;