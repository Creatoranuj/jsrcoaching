
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_user_course_status
  ON public.razorpay_payments(user_id, course_id, status);
CREATE INDEX IF NOT EXISTS idx_razorpay_payments_order_id
  ON public.razorpay_payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_purchased
  ON public.enrollments(user_id, purchased_at DESC);

-- ============================================================
-- 1. Suspicious enrollment scanner
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_suspicious_enrollments(_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  WITH whitelisted AS (
    SELECT (metadata->>'enrollment_id')::bigint AS enrollment_id
    FROM public.audit_log
    WHERE action IN ('enrollment.legit','enrollment.grant')
      AND metadata ? 'enrollment_id'
  ),
  base AS (
    SELECT e.id, e.user_id, e.course_id, e.status, e.purchased_at,
           c.title AS course_title, COALESCE(c.price, 0) AS course_price,
           p.full_name, p.email, p.mobile, p.is_blocked
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.profiles p ON p.id = e.user_id
    WHERE e.status = 'active'
      AND COALESCE(c.price, 0) > 0
      AND e.id NOT IN (SELECT enrollment_id FROM whitelisted WHERE enrollment_id IS NOT NULL)
  ),
  pay_agg AS (
    SELECT b.id AS enrollment_id,
           (SELECT count(*) FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.course_id = b.course_id
                AND rp.status IN ('captured','paid','success')) AS ok_count,
           (SELECT max(rp.amount) FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.course_id = b.course_id
                AND rp.status IN ('captured','paid','success')) AS max_ok_amount,
           (SELECT count(*) FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.status IN ('captured','paid','success')) AS any_paid_count,
           (SELECT rp.status FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.course_id = b.course_id
              ORDER BY rp.created_at DESC LIMIT 1) AS latest_status
    FROM base b
  ),
  dup_orders AS (
    SELECT razorpay_order_id
    FROM public.razorpay_payments
    WHERE razorpay_order_id IS NOT NULL
    GROUP BY razorpay_order_id
    HAVING count(DISTINCT user_id) > 1
  ),
  dup_flag AS (
    SELECT DISTINCT b.id AS enrollment_id
    FROM base b
    JOIN public.razorpay_payments rp ON rp.user_id = b.user_id AND rp.course_id = b.course_id
    JOIN dup_orders d ON d.razorpay_order_id = rp.razorpay_order_id
  ),
  velocity AS (
    SELECT user_id, count(*) AS burst
    FROM public.enrollments
    WHERE purchased_at > now() - interval '10 minutes'
    GROUP BY user_id
    HAVING count(*) > 5
  ),
  flagged AS (
    SELECT b.*, pa.ok_count, pa.max_ok_amount, pa.any_paid_count, pa.latest_status,
      CASE
        WHEN df.enrollment_id IS NOT NULL THEN 'duplicate_order'
        WHEN pa.ok_count = 0 AND pa.any_paid_count = 0 THEN 'no_payment'
        WHEN pa.ok_count = 0 AND pa.any_paid_count > 0 THEN 'payment_for_wrong_course'
        WHEN pa.ok_count = 0 AND pa.latest_status IN ('failed','refunded') THEN 'payment_failed'
        WHEN pa.ok_count > 0 AND pa.max_ok_amount < b.course_price * 0.9 THEN 'amount_mismatch'
        WHEN v.user_id IS NOT NULL THEN 'velocity'
        ELSE NULL
      END AS rule,
      CASE
        WHEN df.enrollment_id IS NOT NULL THEN 'critical'
        WHEN pa.ok_count = 0 AND pa.any_paid_count = 0 THEN 'critical'
        WHEN pa.ok_count = 0 THEN 'high'
        WHEN pa.ok_count > 0 AND pa.max_ok_amount < b.course_price * 0.9 THEN 'high'
        WHEN v.user_id IS NOT NULL THEN 'medium'
        ELSE 'low'
      END AS severity
    FROM base b
    LEFT JOIN pay_agg pa ON pa.enrollment_id = b.id
    LEFT JOIN dup_flag df ON df.enrollment_id = b.id
    LEFT JOIN velocity v ON v.user_id = b.user_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    purchased_at DESC), '[]'::jsonb)
  INTO _result
  FROM (SELECT * FROM flagged WHERE rule IS NOT NULL LIMIT _limit) f;

  RETURN _result;
END;
$$;

-- ============================================================
-- 2. Revoke enrollment
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_revoke_enrollment(_enrollment_id bigint, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _user uuid; _course bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollments SET status = 'revoked'
   WHERE id = _enrollment_id
   RETURNING user_id, course_id INTO _user, _course;

  IF _user IS NULL THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'enrollment.revoke', 'enrollment', _user,
          jsonb_build_object('enrollment_id', _enrollment_id, 'course_id', _course, 'reason', _reason));
END;
$$;

-- ============================================================
-- 3. Whitelist / mark-as-legit
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_mark_enrollment_legit(_enrollment_id bigint, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO _user FROM public.enrollments WHERE id = _enrollment_id;
  IF _user IS NULL THEN RAISE EXCEPTION 'enrollment not found'; END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'enrollment.legit', 'enrollment', _user,
          jsonb_build_object('enrollment_id', _enrollment_id, 'note', _note));
END;
$$;

-- ============================================================
-- Lock down execute per project security-memory (revoke-then-grant)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.admin_get_suspicious_enrollments(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_enrollment(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_enrollment_legit(bigint, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_get_suspicious_enrollments(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_enrollment(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_enrollment_legit(bigint, text) TO authenticated;
