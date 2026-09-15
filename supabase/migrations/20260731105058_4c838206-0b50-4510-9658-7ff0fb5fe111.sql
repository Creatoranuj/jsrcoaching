-- ============================================================
-- 1. enrollments: block course/status hijack via UPDATE
-- ============================================================
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
  )
);

-- ============================================================
-- 2. profiles: block self-unblock / moderation tampering
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_moderation_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side (service_role / no JWT) and admins are trusted.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Identity and moderation state are not user-editable.
  NEW.id             := OLD.id;
  NEW.is_blocked     := OLD.is_blocked;
  NEW.blocked_at     := OLD.blocked_at;
  NEW.blocked_by     := OLD.blocked_by;
  NEW.blocked_reason := OLD.blocked_reason;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_moderation_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_profile_moderation_tampering
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_moderation_tampering();

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================================
-- 3. Role helpers: stop cross-user role enumeration
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  )
  AND (
    auth.uid() IS NULL                 -- server-side / service_role: trusted
    OR _user_id = auth.uid()           -- asking about yourself
    OR EXISTS (                        -- admins may ask about anyone
      SELECT 1 FROM public.user_roles a
      WHERE a.user_id = auth.uid()
        AND a.role = 'admin'::app_role
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND (
      auth.uid() IS NULL
      OR _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles a
        WHERE a.user_id = auth.uid()
          AND a.role = 'admin'::app_role
      )
    )
  ORDER BY CASE ur.role
             WHEN 'admin'::app_role   THEN 0
             WHEN 'teacher'::app_role THEN 1
             ELSE 2
           END
  LIMIT 1;
$$;

-- ============================================================
-- 4. Split anon-facing policies so they never call has_role,
--    then revoke definer functions from signed-out callers.
-- ============================================================
DROP POLICY IF EXISTS "Public can view active landing courses" ON public.landing_courses;
CREATE POLICY "Visitors can view active landing courses"
ON public.landing_courses
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "Members can view landing courses"
ON public.landing_courses
FOR SELECT
TO authenticated
USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public can view active testimonials" ON public.landing_testimonials;
CREATE POLICY "Visitors can view active testimonials"
ON public.landing_testimonials
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "Members can view testimonials"
ON public.landing_testimonials
FOR SELECT
TO authenticated
USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_access_storage_course(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_storage_course(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

-- ============================================================
-- 5. Close the unused GraphQL endpoint (app uses PostgREST only)
-- ============================================================
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;

REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated;