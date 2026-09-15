-- ── 1. Restore the atomic paid-enrollment routine (missing after project move) ──
CREATE OR REPLACE FUNCTION public.complete_paid_enrollment(
  _user_id uuid,
  _course_id bigint,
  _razorpay_order_id text,
  _razorpay_payment_id text
)
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

REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid, bigint, text, text) TO service_role;

-- ── 2. Public buckets: keep public CDN reads, remove bucket enumeration ──
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read book-covers" ON storage.objects;
DROP POLICY IF EXISTS "Public read content" ON storage.objects;

-- ── 3. security_events: stop spoofing / flooding of client telemetry ──
CREATE OR REPLACE FUNCTION public.guard_security_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
  v_window timestamptz := date_trunc('hour', now());
BEGIN
  -- Server-side (service_role / no JWT) writes are trusted as-is
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ownership cannot be forged
  NEW.user_id := v_uid;

  IF NEW.event_type IS NULL OR length(NEW.event_type) > 64 THEN
    RAISE EXCEPTION 'invalid event_type';
  END IF;

  IF length(COALESCE(NEW.payload, '{}'::jsonb)::text) > 4000 THEN
    RAISE EXCEPTION 'payload too large';
  END IF;

  INSERT INTO public.rate_limits (bucket, user_id, window_start, count)
  VALUES ('security_events_insert', v_uid, v_window, 1)
  ON CONFLICT (bucket, user_id, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  IF v_count > 60 THEN
    RAISE EXCEPTION 'security event rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_security_event_insert_trg ON public.security_events;
CREATE TRIGGER guard_security_event_insert_trg
BEFORE INSERT ON public.security_events
FOR EACH ROW EXECUTE FUNCTION public.guard_security_event_insert();

REVOKE UPDATE, DELETE ON public.security_events FROM authenticated;
REVOKE SELECT ON public.security_events FROM anon;