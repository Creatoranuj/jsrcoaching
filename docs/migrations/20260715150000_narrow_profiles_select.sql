-- Proposed migration for the HIGH finding in docs/AUDIT-2026-07-15.md
-- (authenticated PII enumeration on public.profiles).
--
-- No migration tool is available in this Lovable session, so this SQL is
-- staged here for the user to apply via their Supabase CLI / SQL editor.
-- Suggested filename when moved into supabase/migrations/:
--   20260715150000_narrow_profiles_select.sql
--
-- Narrow SELECT on public.profiles so authenticated users can only read
-- their own row (plus admins/teachers via has_role). Prevents authenticated
-- PII enumeration of email + mobile across all users.
--
-- Public-facing profile fanout (id, full_name, avatar_url) MUST go through
-- public.profiles_public, which is granted to anon/authenticated separately.

-- Drop every historical SELECT policy variant that grants broad access.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read any profile public info" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Block public access" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Block anon profile reads" ON public.profiles;

-- Owner + staff (admin, teacher) SELECT. Teachers need student contact info
-- for doubt-session workflows; students never see other students' PII.
CREATE POLICY "Users read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
  );

-- Explicitly re-block anon; matches prior REVOKE and belt-and-braces.
CREATE POLICY "Block anon profile reads"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (false);

-- profiles_public view already exposes safe columns to authenticated + anon;
-- re-affirm the grant in case a future migration drops it.
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;
