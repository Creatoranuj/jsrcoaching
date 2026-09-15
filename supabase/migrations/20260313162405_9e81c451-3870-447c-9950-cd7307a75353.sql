
-- 1. Create profile for the active logged-in user cd60d033
INSERT INTO public.profiles (id, full_name, email)
VALUES ('cd60d033-0724-4935-968f-7f2d8f811de4', 'Anuj Yadav', 'naveenbharatprism@gmail.com')
ON CONFLICT (id) DO UPDATE SET full_name = 'Anuj Yadav', email = 'naveenbharatprism@gmail.com';

-- 2. Set cd60d033 as admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('cd60d033-0724-4935-968f-7f2d8f811de4', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Demote ALL other admins to student
UPDATE public.user_roles SET role = 'student'
WHERE role = 'admin' AND user_id != 'cd60d033-0724-4935-968f-7f2d8f811de4';

-- 4. Update the assign_admin_on_signup function
CREATE OR REPLACE FUNCTION public.assign_admin_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.email = 'naveenbharatprism@gmail.com' THEN
    UPDATE public.user_roles SET role = 'admin' WHERE user_id = NEW.id;
    IF NOT FOUND THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
