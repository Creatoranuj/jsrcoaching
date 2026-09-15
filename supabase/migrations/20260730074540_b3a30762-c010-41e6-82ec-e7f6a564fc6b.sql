CREATE OR REPLACE FUNCTION public.guard_enrollment_update()
RETURNS TRIGGER
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

  IF NEW.course_id IS DISTINCT FROM OLD.course_id THEN
    RAISE EXCEPTION 'course_id cannot be changed';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(price, 0) INTO v_price FROM public.courses WHERE id = NEW.course_id;
    IF NEW.status = 'active' AND COALESCE(v_price, 0) <= 0 THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'status cannot be changed by the enrolled user';
  END IF;

  RETURN NEW;
END;
$$;