
-- Make user 03f23aaa (Anuj Yadav / naveenbharatprism@gmail.com) admin
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = '03f23aaa-0e6a-4996-ab34-47735725f2ba';

-- Also update profile with correct name and email
UPDATE public.profiles 
SET full_name = 'Anuj Yadav', email = 'naveenbharatprism@gmail.com' 
WHERE id = '03f23aaa-0e6a-4996-ab34-47735725f2ba';
