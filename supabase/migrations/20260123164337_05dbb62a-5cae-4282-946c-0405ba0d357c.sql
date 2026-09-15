-- SECURITY HARDENING MIGRATION
-- ============================================

-- 1. Drop the overly permissive teacher policy on profiles
DROP POLICY IF EXISTS "Teachers can view profiles" ON public.profiles;

-- 2. Create a public view that excludes sensitive PII (mobile, email)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  id,
  full_name,
  role,
  created_at
FROM public.profiles;

-- 3. Grant access to the view for authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;

-- 4. Admin-only function to fetch full profiles (audit-ready)
CREATE OR REPLACE FUNCTION public.get_user_profiles_admin()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  mobile text,
  role text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.mobile, p.role, p.created_at
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
$$;

-- 5. Tighten leads access - drop old policy and create stricter one
DROP POLICY IF EXISTS "Admins can view leads" ON public.leads;

CREATE POLICY "Only admins can view leads"
ON public.leads
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Ensure RLS is ON for sensitive tables (already on, but explicit)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;