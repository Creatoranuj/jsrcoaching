
-- Critical #2: prevent non-admins from changing enrollment.status (privilege escalation guard)
CREATE OR REPLACE FUNCTION public.prevent_enrollment_status_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins and service_role bypass.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Changing enrollment status is not permitted'
      USING ERRCODE = '42501';
  END IF;

  -- Also pin immutable identity columns so a user cannot reassign their row.
  IF NEW.user_id   IS DISTINCT FROM OLD.user_id
  OR NEW.course_id IS DISTINCT FROM OLD.course_id THEN
    RAISE EXCEPTION 'Changing enrollment user/course is not permitted'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_enrollment_status_tampering ON public.enrollments;
CREATE TRIGGER trg_prevent_enrollment_status_tampering
BEFORE UPDATE ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_enrollment_status_tampering();

-- High: drop unused client INSERT policy on razorpay_payments
DROP POLICY IF EXISTS "Users insert own razorpay payments" ON public.razorpay_payments;
