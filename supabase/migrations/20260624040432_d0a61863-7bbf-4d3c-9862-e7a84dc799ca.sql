ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- Amount tamper guard: claimed amount must be >= course price.
CREATE OR REPLACE FUNCTION public.validate_payment_request_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _price numeric;
BEGIN
  IF NEW.course_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT price INTO _price FROM public.courses WHERE id = NEW.course_id;
  IF _price IS NULL OR _price = 0 THEN
    -- Free course should not flow through manual payment.
    RAISE EXCEPTION 'Course % is free; manual payment request not allowed', NEW.course_id
      USING ERRCODE = '22023';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount < _price THEN
    RAISE EXCEPTION 'Payment amount (%) is less than course price (%)', NEW.amount, _price
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_request_amount ON public.payment_requests;
CREATE TRIGGER trg_validate_payment_request_amount
  BEFORE INSERT OR UPDATE OF amount, course_id ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_request_amount();

-- Stamp approver/rejector on status transitions.
CREATE OR REPLACE FUNCTION public.stamp_payment_request_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
      NEW.approved_at := COALESCE(NEW.approved_at, now());
    ELSIF NEW.status = 'rejected' THEN
      NEW.rejected_by := COALESCE(NEW.rejected_by, auth.uid());
      NEW.rejected_at := COALESCE(NEW.rejected_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_payment_request_actor ON public.payment_requests;
CREATE TRIGGER trg_stamp_payment_request_actor
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_payment_request_actor();