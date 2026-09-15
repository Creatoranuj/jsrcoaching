
-- Create missing triggers on auth.users for profile + role creation on signup

-- Profile creation trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Student role assignment trigger
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();

-- Admin auto-assign trigger
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_admin_on_signup();

-- Backfill profiles for existing users who don't have one
INSERT INTO public.profiles (id, full_name, email)
SELECT u.id, u.raw_user_meta_data->>'full_name', u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Backfill student roles for existing users who don't have any role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'student'
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;
