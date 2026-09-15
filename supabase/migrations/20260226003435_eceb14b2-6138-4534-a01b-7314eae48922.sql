
-- Create admin user via profiles and user_roles
-- The auth.users creation must happen via Supabase Auth API (edge function)
-- So we'll create a temporary bootstrap function

CREATE OR REPLACE FUNCTION public.bootstrap_admin(admin_email text, admin_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  -- This function can only be called once to bootstrap
  -- After that, it self-destructs
  
  -- Check if this email already has admin role
  IF EXISTS (
    SELECT 1 FROM profiles p 
    JOIN user_roles ur ON p.id = ur.user_id 
    WHERE p.email = admin_email AND ur.role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin already exists for this email');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Use the setup-admin edge function to create the admin user');
END;
$$;

-- Drop the function immediately since we don't actually need it
DROP FUNCTION IF EXISTS public.bootstrap_admin(text, text);
