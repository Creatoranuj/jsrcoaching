
-- Fix security definer view by using security_invoker
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public 
WITH (security_invoker = on)
AS SELECT id, full_name, avatar_url FROM public.profiles;

-- Fix presenter_notes overly permissive policy
DROP POLICY IF EXISTS "Allow all access to presenter_notes" ON public.presenter_notes;
CREATE POLICY "Authenticated users can manage presenter_notes" ON public.presenter_notes FOR ALL USING (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
