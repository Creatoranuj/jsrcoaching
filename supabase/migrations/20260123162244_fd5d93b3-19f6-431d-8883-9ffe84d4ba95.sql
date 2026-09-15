-- =============================================
-- SECURITY FIX: Restrict leads table SELECT access
-- =============================================

-- Drop existing permissive policy if exists
DROP POLICY IF EXISTS "Anyone can view leads" ON public.leads;

-- Ensure only admins and teachers can SELECT leads
-- (The INSERT policy for public lead submission already exists)
-- No additional policy needed since "Admins can view leads" already exists