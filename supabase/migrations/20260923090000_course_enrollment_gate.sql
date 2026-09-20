-- ════════════════════════════════════════════════════════════════════════
-- Batch Full gate + "forgot which email" lookup
--
-- 1. courses.enrollment_open / courses.seat_limit — admin-controlled switch
--    that hides the Buy button and, critically, refuses the enrollment
--    server-side so a direct /buy-course link cannot bypass it.
-- 2. public.course_availability() — safe read for the client (no enrollments
--    table exposure).
-- 3. public.complete_paid_enrollment() — re-created with the gate inside the
--    same transaction/row lock that creates the enrollment.
-- 4. public.lookup_email_hint() — masked email for a registered mobile, so a
--    student who forgot which email they signed up with can still reset.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Course columns ────────────────────────────────────────────────────
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS enrollment_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS seat_limit integer;

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_seat_limit_positive;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_seat_limit_positive
  CHECK (seat_limit IS NULL OR seat_limit > 0);

COMMENT ON COLUMN public.courses.enrollment_open IS
  'Admin switch. false = "Batch Full": Buy button hidden and paid enrollment refused.';
COMMENT ON COLUMN public.courses.seat_limit IS
  'Optional hard cap on active enrollments. NULL = unlimited.';

-- Counting active enrollments per course is on the payment hot path.
CREATE INDEX IF NOT EXISTS enrollments_course_active_idx
  ON public.enrollments (course_id)
  WHERE status = 'active';

-- ── 2. Public availability read ──────────────────────────────────────────
-- SECURITY DEFINER so the client never needs SELECT on public.enrollments.
CREATE OR REPLACE FUNCTION public.course_availability(_course_id bigint)
RETURNS TABLE (
  enrollment_open boolean,
  seat_limit integer,
  seats_taken integer,
  is_full boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.enrollment_open,
    c.seat_limit,
    taken.n::integer,
    (NOT c.enrollment_open) OR (c.seat_limit IS NOT NULL AND taken.n >= c.seat_limit)
  FROM public.courses c
  CROSS JOIN LATERAL (
    SELECT count(*) AS n
    FROM public.enrollments e
    WHERE e.course_id = c.id AND e.status = 'active'
  ) AS taken
  WHERE c.id = _course_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.course_availability(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_availability(bigint) TO anon, authenticated, service_role;

-- ── 3. Server-side enforcement on the paid-enrollment routine ────────────
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
  _already_enrolled boolean;
  _open boolean;
  _limit integer;
  _taken integer;
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

  -- Batch-full gate. Re-entrant: a student who is already enrolled (retry,
  -- duplicate webhook) always passes so we never strand a paid seat.
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE user_id = _user_id AND course_id = _course_id AND status = 'active'
  ) INTO _already_enrolled;

  IF NOT _already_enrolled THEN
    -- Lock the course row so two concurrent payments cannot both take the
    -- last seat.
    SELECT c.enrollment_open, c.seat_limit
      INTO _open, _limit
      FROM public.courses c
     WHERE c.id = _course_id
     FOR UPDATE;

    IF _open IS NULL THEN
      RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT _open THEN
      RAISE EXCEPTION 'Enrollment is closed for this batch' USING ERRCODE = 'P0001';
    END IF;

    IF _limit IS NOT NULL THEN
      SELECT count(*) INTO _taken
      FROM public.enrollments
      WHERE course_id = _course_id AND status = 'active';

      IF _taken >= _limit THEN
        RAISE EXCEPTION 'This batch is full (% of % seats taken)', _taken, _limit
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
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

-- ── 4. "Forgot which email" — masked hint from a registered mobile ───────
-- Returns e.g. 'a****j@gmail.com', never the full address, so this cannot be
-- used to harvest emails. NULL when no account matches.
CREATE OR REPLACE FUNCTION public.lookup_email_hint(p_mobile text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _digits text := regexp_replace(COALESCE(p_mobile, ''), '\D', '', 'g');
  _email  text;
  _local  text;
  _domain text;
BEGIN
  IF length(_digits) < 10 THEN
    RETURN NULL;
  END IF;

  -- Match on the last 10 digits so +91 / 0 prefixes both work.
  _digits := right(_digits, 10);

  SELECT p.email INTO _email
  FROM public.profiles p
  WHERE p.email IS NOT NULL
    AND right(regexp_replace(COALESCE(p.mobile, ''), '\D', '', 'g'), 10) = _digits
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;

  IF _email IS NULL OR position('@' IN _email) = 0 THEN
    RETURN NULL;
  END IF;

  _local  := split_part(_email, '@', 1);
  _domain := split_part(_email, '@', 2);

  IF length(_local) <= 2 THEN
    RETURN repeat('*', length(_local)) || '@' || _domain;
  END IF;

  RETURN left(_local, 1) || repeat('*', length(_local) - 2) || right(_local, 1) || '@' || _domain;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.lookup_email_hint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_email_hint(text) TO anon, authenticated, service_role;
