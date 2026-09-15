
-- FIX 5 (HIGH): profiles_public is a VIEW — RLS is enforced on the base profiles table.
-- The existing "Users can view own profile" and "Admins can view all profiles" policies
-- already cover this. We add a policy so authenticated users can look up OTHER users'
-- public info (name, avatar) which is needed by chat and comments.
DROP POLICY IF EXISTS "Authenticated users can read any profile public info" ON public.profiles;

CREATE POLICY "Authenticated users can read any profile public info"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);
