-- =============================================
-- SECURITY FIX: Comprehensive RLS Hardening
-- =============================================

-- 1. Fix handle_new_user function search_path
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'student');
  RETURN new;
END;
$function$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Drop ALL overly permissive "always true" policies on sensitive tables

-- Drop problematic profiles policies
DROP POLICY IF EXISTS "Public Access Profiles" ON public.profiles;

-- Drop problematic courses policies (keep public read)
DROP POLICY IF EXISTS "Public Access Courses" ON public.courses;

-- Drop problematic enrollments policies
DROP POLICY IF EXISTS "Public Access Enrollments" ON public.enrollments;

-- Drop problematic payment_requests policies
DROP POLICY IF EXISTS "Public Access Payments" ON public.payment_requests;

-- 3. Create proper RLS policies for profiles (hide PII from public)

-- Users can only view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- Teachers can view student profiles
CREATE POLICY "Teachers can view profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'teacher'));

-- 4. Fix enrollments - restrict to own data + admins
CREATE POLICY "Admins can manage enrollments" 
ON public.enrollments 
FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own enrollments" 
ON public.enrollments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 5. Fix payment_requests - proper access control
CREATE POLICY "Users can view own payment requests" 
ON public.payment_requests 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all payment requests" 
ON public.payment_requests 
FOR ALL 
USING (has_role(auth.uid(), 'admin'));

-- 6. Fix leads table - admin/teacher read only
CREATE POLICY "Admins can view leads" 
ON public.leads 
FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- 7. Fix courses - keep public read but restrict write to admins only
CREATE POLICY "Admins can update courses" 
ON public.courses 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

-- 8. Drop duplicate SELECT policies on courses (keep clean ones)
DROP POLICY IF EXISTS "Courses are viewable by everyone" ON public.courses;
DROP POLICY IF EXISTS "Public courses are viewable by everyone" ON public.courses;
DROP POLICY IF EXISTS "Public view" ON public.courses;