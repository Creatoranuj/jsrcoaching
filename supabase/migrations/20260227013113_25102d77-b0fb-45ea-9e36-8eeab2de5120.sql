
-- 1. Update handle_new_user() to stop inserting role into profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email);
  RETURN new;
END;
$$;

-- 2. Update get_user_profiles_admin to get role from user_roles instead of profiles
CREATE OR REPLACE FUNCTION public.get_user_profiles_admin()
RETURNS TABLE(id uuid, full_name text, email text, mobile text, role text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.email, p.mobile, 
         COALESCE(ur.role::text, 'student') as role, 
         p.created_at
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE public.has_role(auth.uid(), 'admin')
$$;

-- 3. Drop the old profiles_public view/table and recreate as secure view
DROP VIEW IF EXISTS public.profiles_public;
DROP TABLE IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker=on) AS
  SELECT id, full_name, avatar_url
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon;
GRANT SELECT ON public.profiles_public TO authenticated;

-- 4. Remove broad student/attendance SELECT policies (strict security)
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;

-- 5. Make payment_requests.user_id NOT NULL
ALTER TABLE public.payment_requests ALTER COLUMN user_id SET NOT NULL;
