DROP POLICY IF EXISTS "No direct access to users table" ON public.users;
DROP POLICY IF EXISTS "No direct delete to users table" ON public.users;
DROP POLICY IF EXISTS "No direct insert to users table" ON public.users;
DROP POLICY IF EXISTS "No direct update to users table" ON public.users;
DROP TABLE IF EXISTS public.users;