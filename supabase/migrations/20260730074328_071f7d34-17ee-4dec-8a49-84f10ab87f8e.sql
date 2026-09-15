-- 1) Remove the permissive enrollment INSERT policy that ORs away the paid check
DROP POLICY IF EXISTS "Users can insert own enrollments" ON public.enrollments;

-- 2) Block privilege escalation via UPDATE (course_id / status swap)
CREATE OR REPLACE FUNCTION public.guard_enrollment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins and server-side (service_role / no JWT) bypass the guard
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.course_id IS DISTINCT FROM OLD.course_id THEN
    RAISE EXCEPTION 'course_id cannot be changed';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'status cannot be changed by the enrolled user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_enrollment_update_trg ON public.enrollments;
CREATE TRIGGER guard_enrollment_update_trg
BEFORE UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment_update();

-- 3) Remove the message UPDATE policy with no WITH CHECK (recipient could rewrite content)
DROP POLICY IF EXISTS "Users can update their sent messages" ON public.messages;

-- 4) Audit log is server-side only
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated;
GRANT ALL ON public.audit_log TO service_role;