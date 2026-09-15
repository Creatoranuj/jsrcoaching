-- Insert missing profile for student account
INSERT INTO public.profiles (id, full_name, email, role)
VALUES ('71e34f8e-9618-4ebf-85dc-ccaef85bc450', 'Anuj Kumar', 'anujkumar75yadav@gmail.com', 'student')
ON CONFLICT (id) DO NOTHING;

-- Insert missing role for student account  
INSERT INTO public.user_roles (user_id, role)
VALUES ('71e34f8e-9618-4ebf-85dc-ccaef85bc450', 'student')
ON CONFLICT (user_id, role) DO NOTHING;