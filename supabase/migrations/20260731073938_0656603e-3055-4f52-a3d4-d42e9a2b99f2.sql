-- 1) Remove email-match admin auto-grant
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;
DROP FUNCTION IF EXISTS public.assign_admin_on_signup();

-- 2) Harden self-role-escalation guard and attach it
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Server-side (service_role / triggers with no JWT) is trusted
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- Nobody may grant themselves a non-student role, not even an admin
  IF NEW.user_id = auth.uid() AND NEW.role <> 'student'::app_role THEN
    RAISE EXCEPTION 'You cannot grant yourself elevated roles';
  END IF;

  -- Only admins may grant elevated roles to others
  IF NEW.role <> 'student'::app_role AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can grant elevated roles';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.user_roles;
CREATE TRIGGER trg_prevent_self_role_escalation
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

-- 3) Collapse overlapping user_roles policies
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles for others" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles for others" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles for others" ON public.user_roles;

CREATE POLICY "roles_select_own" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "roles_select_admin" ON public.user_roles
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "roles_insert_admin_others" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND user_id <> auth.uid());

CREATE POLICY "roles_update_admin_others" ON public.user_roles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND user_id <> auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND user_id <> auth.uid());

CREATE POLICY "roles_delete_admin_others" ON public.user_roles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND user_id <> auth.uid());

-- 4) Enrollment payment enforcement (defense in depth over the RLS policy)
CREATE OR REPLACE FUNCTION public.enforce_enrollment_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_price numeric;
BEGIN
  -- Server-side writes (edge functions / service_role) are trusted
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  IF public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'teacher'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> v_uid THEN
    RAISE EXCEPTION 'You can only enroll yourself';
  END IF;

  SELECT COALESCE(price, 0) INTO v_price FROM public.courses WHERE id = NEW.course_id;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  IF v_price <= 0 THEN
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.razorpay_payments rp
    WHERE rp.user_id = v_uid
      AND rp.course_id = NEW.course_id
      AND rp.status = 'completed'
      AND rp.amount >= v_price
  ) THEN
    RAISE EXCEPTION 'Payment required before enrolling in this course';
  END IF;

  NEW.status := 'active';
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_enrollment_payment ON public.enrollments;
CREATE TRIGGER trg_enforce_enrollment_payment
BEFORE INSERT ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.enforce_enrollment_payment();

DROP TRIGGER IF EXISTS trg_guard_enrollment_update ON public.enrollments;
CREATE TRIGGER trg_guard_enrollment_update
BEFORE UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment_update();