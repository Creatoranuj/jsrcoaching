
-- Fix profiles policies: restrict to authenticated users only
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Fix leads policies: restrict SELECT to authenticated admins
DROP POLICY IF EXISTS "Only admins can view leads" ON public.leads;

CREATE POLICY "Only admins can view leads" ON public.leads
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Secure profiles_public view
ALTER VIEW public.profiles_public SET (security_invoker = on);
