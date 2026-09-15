-- Fix 1: Create the missing auth triggers that fire on new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE TRIGGER on_auth_user_role_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Fix 2: Backfill profiles for existing auth users who have no profile row
INSERT INTO public.profiles (id, full_name, email)
SELECT 
  au.id,
  au.raw_user_meta_data->>'full_name',
  au.email
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- Fix 3: Backfill student role for any auth users who have no role row
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'student'::app_role
FROM auth.users au
WHERE au.id NOT IN (SELECT user_id FROM public.user_roles)
ON CONFLICT (user_id, role) DO NOTHING;

-- Fix 4: Promote the admin user to admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'naveenbharatprism@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;