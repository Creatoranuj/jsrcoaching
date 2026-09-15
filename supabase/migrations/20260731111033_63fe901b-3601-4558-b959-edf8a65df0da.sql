-- Silently pin the immutable columns instead of raising, so a tampering
-- attempt is neutralised without surfacing an exception to the client.
CREATE OR REPLACE FUNCTION public.guard_enrollment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
BEGIN
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'teacher'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Identity of the enrollment is not user-editable.
  NEW.course_id := OLD.course_id;
  NEW.user_id   := OLD.user_id;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Self-cancellation stays allowed.
    IF NEW.status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(price, 0) INTO v_price FROM public.courses WHERE id = NEW.course_id;
    IF NEW.status = 'active' AND COALESCE(v_price, 0) <= 0 THEN
      RETURN NEW;
    END IF;

    -- Anything else: revert, do not escalate.
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Recognise the UPI / approved-payment-request flow as valid proof too.
DROP POLICY IF EXISTS "Users can update own enrollment progress" ON public.enrollments;

CREATE POLICY "Users can update own enrollment progress"
ON public.enrollments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = enrollments.course_id
        AND COALESCE(c.price, 0) <= 0
    )
    OR EXISTS (
      SELECT 1 FROM public.razorpay_payments rp
      WHERE rp.user_id = auth.uid()
        AND rp.course_id = enrollments.course_id
        AND rp.status = 'completed'
    )
    OR EXISTS (
      SELECT 1 FROM public.payment_requests pr
      WHERE pr.user_id = auth.uid()
        AND pr.course_id = enrollments.course_id
        AND pr.status = 'approved'
    )
  )
);