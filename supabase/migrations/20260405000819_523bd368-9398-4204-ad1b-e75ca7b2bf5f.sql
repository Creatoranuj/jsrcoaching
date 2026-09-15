-- Re-create auth triggers (functions already exist)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();

CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.assign_admin_on_signup();

-- Backfill: ensure all auth.users have profiles
INSERT INTO public.profiles (id, full_name, email)
SELECT u.id, u.raw_user_meta_data->>'full_name', u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Backfill: ensure all auth.users have a role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'student'::public.app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;