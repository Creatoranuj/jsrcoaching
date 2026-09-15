CREATE OR REPLACE FUNCTION public.process_refund(_razorpay_order_id text, _is_full boolean DEFAULT true, _refund_amount numeric DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_course bigint;
BEGIN
  IF _is_full THEN
    UPDATE public.razorpay_payments
       SET status = 'refunded', updated_at = now()
     WHERE razorpay_order_id = _razorpay_order_id
     RETURNING user_id, course_id INTO v_user, v_course;
  ELSE
    UPDATE public.razorpay_payments
       SET status = 'partially_refunded', updated_at = now()
     WHERE razorpay_order_id = _razorpay_order_id
     RETURNING user_id, course_id INTO v_user, v_course;
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'payment not found for order %', _razorpay_order_id;
  END IF;

  IF _is_full THEN
    UPDATE public.enrollments
       SET status = 'refunded'
     WHERE user_id = v_user AND course_id = v_course;
  END IF;

  INSERT INTO public.audit_log (actor_id, user_id, action, table_name, entity_type, entity_id, record_count, metadata)
  VALUES (NULL, v_user,
          CASE WHEN _is_full THEN 'refund_processed' ELSE 'partial_refund_processed' END,
          'razorpay_payments', 'payment', v_user, 1,
          jsonb_build_object('razorpay_order_id', _razorpay_order_id,
                             'course_id', v_course,
                             'is_full', _is_full,
                             'refund_amount', _refund_amount));
END;
$function$;

REVOKE ALL ON FUNCTION public.process_refund(text, boolean, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(text, boolean, numeric) TO service_role;