-- Block anonymous/unauthenticated access to profiles table
CREATE POLICY "Block public access" ON public.profiles FOR SELECT TO anon USING (false);