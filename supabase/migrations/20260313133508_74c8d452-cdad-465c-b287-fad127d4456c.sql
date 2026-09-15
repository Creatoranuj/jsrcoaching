
-- questions_for_students is a VIEW - secure it by replacing with a security_invoker view
-- First check: the broad profile policy was already dropped, triggers were already created
-- Just need to handle the view security

-- Recreate the view with security_invoker = true so it respects the caller's RLS
-- First get the view definition
DO $$
DECLARE
  view_def text;
BEGIN
  SELECT pg_get_viewdef('public.questions_for_students'::regclass, true) INTO view_def;
  EXECUTE 'DROP VIEW IF EXISTS public.questions_for_students';
  EXECUTE 'CREATE VIEW public.questions_for_students WITH (security_invoker = true) AS ' || view_def;
  EXECUTE 'GRANT SELECT ON public.questions_for_students TO authenticated';
END $$;
