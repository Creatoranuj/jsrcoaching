-- Add admin role to all user accounts with email naveenbharatprism@gmail.com
-- First, update existing student roles to admin
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE email = 'naveenbharatprism@gmail.com'
) AND role != 'admin';

-- Also ensure any missing user_roles entries exist
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE p.email = 'naveenbharatprism@gmail.com'
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
)
ON CONFLICT (user_id, role) DO NOTHING;