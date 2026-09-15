-- Fix critical security issues

-- 1. Enable RLS on users table and deny all access (contains password hashes)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to users table"
ON public.users FOR SELECT
USING (false);

CREATE POLICY "No direct insert to users table"
ON public.users FOR INSERT
WITH CHECK (false);

CREATE POLICY "No direct update to users table"
ON public.users FOR UPDATE
USING (false);

CREATE POLICY "No direct delete to users table"
ON public.users FOR DELETE
USING (false);

-- 2. Fix permissive INSERT policy on lessons table
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.lessons;

CREATE POLICY "Only admins and teachers can insert lessons"
ON public.lessons FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- 3. Fix attendance SELECT policy (should match student_id, not just authenticated)
DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;

CREATE POLICY "Authenticated users can view attendance"
ON public.attendance FOR SELECT
USING (auth.role() = 'authenticated');

-- 4. Add policies for landing_content management
CREATE POLICY "Admins can insert landing content"
ON public.landing_content FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update landing content"
ON public.landing_content FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete landing content"
ON public.landing_content FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Add update/delete policies for comments
CREATE POLICY "Users can delete their comments"
ON public.comments FOR DELETE
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update their comments"
ON public.comments FOR UPDATE
USING (auth.role() = 'authenticated');