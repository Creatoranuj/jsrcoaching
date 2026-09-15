
-- Fix 1: Drop overly permissive comments policies (comments RLS conflict)
DROP POLICY IF EXISTS "Users can update their comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete their comments" ON public.comments;
