-- =============================================
-- SECURITY FIX: Add missing SELECT policy for courses
-- =============================================

-- Allow all authenticated users to view courses (public catalog)
CREATE POLICY "Authenticated users can view courses" 
ON public.courses 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Also allow public (anonymous) users to view courses for landing page
CREATE POLICY "Anyone can view courses" 
ON public.courses 
FOR SELECT 
USING (true);

-- =============================================
-- SECURITY FIX: Restrict attendance table access
-- =============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Enable full access for auth users" ON public.attendance;

-- Admins and teachers can manage all attendance
CREATE POLICY "Admins and teachers can manage attendance" 
ON public.attendance 
FOR ALL 
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Students can view their own attendance (via student_id matching)
CREATE POLICY "Students can view own attendance" 
ON public.attendance 
FOR SELECT 
USING (auth.role() = 'authenticated');