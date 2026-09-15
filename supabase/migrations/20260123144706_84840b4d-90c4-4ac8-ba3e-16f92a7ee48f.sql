-- =============================================
-- SECURITY FIX: Enable RLS on all tables & cleanup
-- =============================================

-- 1. Enable RLS on profiles (was disabled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop remaining overly permissive policies
DROP POLICY IF EXISTS "Public Insert Leads" ON public.leads;

-- 3. Create proper insert policy for leads (public can submit but not read)
CREATE POLICY "Anyone can submit leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (true);

-- 4. Drop old permissive policies that still exist
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;