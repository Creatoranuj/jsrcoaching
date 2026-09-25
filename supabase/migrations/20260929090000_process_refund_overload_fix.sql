-- Refund bookkeeping fix (applied live 2026-09-25).
--
-- The live database still had the original one-argument
-- process_refund(_razorpay_order_id text). The admin refund function
-- (supabase/functions/initiate-refund) has called the three-argument form
-- process_refund(_razorpay_order_id, _is_full, _refund_amount) since
-- migration 20260803024120 — which never reached this project. Result: the
-- Razorpay refund went through, the RPC failed with "function not found",
-- the payment row stayed `completed` and the student kept course access
-- (the function only surfaced a warning).
--
-- Replace the old overload so PostgREST resolves the call unambiguously.
DROP FUNCTION IF EXISTS public.process_refund(text);

CREATE OR REPLACE FUNCTION public.process_refund(_razorpay_order_id text, _is_full boolean DEFAULT true, _refund_amount numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_course bigint;
BEGIN
  UPDATE public.razorpay_payments
     SET status = CASE WHEN _is_full THEN 'refunded' ELSE 'partially_refunded' END,
         updated_at = now()
   WHERE razorpay_order_id = _razorpay_order_id
   RETURNING user_id, course_id INTO v_user, v_course;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for order %', _razorpay_order_id USING ERRCODE = 'P0002';
  END IF;

  -- Full refund revokes access; a partial refund keeps the enrollment.
  IF _is_full AND v_course IS NOT NULL THEN
    UPDATE public.enrollments
       SET status = 'refunded'
     WHERE user_id = v_user AND course_id = v_course AND status <> 'refunded';
  END IF;

  INSERT INTO public.audit_log (actor_id, user_id, action, table_name, entity_type, entity_id, record_count, metadata)
  VALUES (NULL, v_user,
          CASE WHEN _is_full THEN 'refund_processed' ELSE 'partial_refund_processed' END,
          'razorpay_payments', 'payment', v_user, 1,
          jsonb_build_object('razorpay_order_id', _razorpay_order_id,
                             'course_id', v_course,
                             'is_full', _is_full,
                             'refund_amount', _refund_amount));

  RETURN jsonb_build_object('user_id', v_user, 'course_id', v_course, 'is_full', _is_full);
END;
$function$;

REVOKE ALL ON FUNCTION public.process_refund(text, boolean, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(text, boolean, numeric) TO service_role;
