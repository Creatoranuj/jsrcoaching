
-- Fix privilege escalation: Drop overly permissive INSERT policy on user_roles for public role
-- and ensure only authenticated admins can manage roles

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

-- Recreate tighter policies scoped to authenticated role only
CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix funnel_entries: add explicit SELECT policy for admins only
DROP POLICY IF EXISTS "Admins manage funnel entries" ON public.funnel_entries;

CREATE POLICY "Admins can select funnel entries"
  ON public.funnel_entries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert funnel entries"
  ON public.funnel_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update funnel entries"
  ON public.funnel_entries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete funnel entries"
  ON public.funnel_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix user_sessions: add INSERT and DELETE policies
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'user_sessions' AND schemaname = 'public') THEN
    EXECUTE 'CREATE POLICY "Users can insert own sessions" ON public.user_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "Users can delete own sessions" ON public.user_sessions FOR DELETE TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "Admins can delete any session" ON public.user_sessions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))';
  END IF;
END $$;
