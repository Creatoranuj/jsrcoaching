-- Fix: public landing tables unreadable for signed-out visitors.
--
-- 20260928090000 merged the "public active rows" + "admin sees all" SELECT
-- policies into one policy granted TO anon, authenticated:
--     USING (is_active = true OR has_role((select auth.uid()), 'admin'))
-- but EXECUTE on public.has_role() is intentionally revoked from anon
-- (definer-grants audit). Postgres does not guarantee OR short-circuit inside
-- a policy expression, so every anon SELECT on these tables failed with
--     42501 permission denied for function has_role
-- and the signed-out home page lost its courses / testimonials / hero /
-- social links / public site settings.
--
-- Split per role instead: exactly one permissive SELECT policy per role, so
-- the "multiple permissive policies" advisory stays clear AND anon never
-- evaluates has_role().

-- landing_testimonials -------------------------------------------------------
DROP POLICY IF EXISTS merged_select_landing_testimonials ON public.landing_testimonials;
DROP POLICY IF EXISTS landing_testimonials_select_anon ON public.landing_testimonials;
DROP POLICY IF EXISTS landing_testimonials_select_auth ON public.landing_testimonials;
CREATE POLICY landing_testimonials_select_anon ON public.landing_testimonials
  FOR SELECT TO anon
  USING (is_active = true);
CREATE POLICY landing_testimonials_select_auth ON public.landing_testimonials
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role((select auth.uid()), 'admin'::public.app_role));

-- landing_courses -------------------------------------------------------------
DROP POLICY IF EXISTS merged_select_landing_courses ON public.landing_courses;
DROP POLICY IF EXISTS landing_courses_select_anon ON public.landing_courses;
DROP POLICY IF EXISTS landing_courses_select_auth ON public.landing_courses;
CREATE POLICY landing_courses_select_anon ON public.landing_courses
  FOR SELECT TO anon
  USING (is_active = true);
CREATE POLICY landing_courses_select_auth ON public.landing_courses
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role((select auth.uid()), 'admin'::public.app_role));

-- hero ------------------------------------------------------------------------
DROP POLICY IF EXISTS merged_select_hero ON public.hero;
DROP POLICY IF EXISTS hero_select_anon ON public.hero;
DROP POLICY IF EXISTS hero_select_auth ON public.hero;
CREATE POLICY hero_select_anon ON public.hero
  FOR SELECT TO anon
  USING (is_active = true);
CREATE POLICY hero_select_auth ON public.hero
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role((select auth.uid()), 'admin'::public.app_role));

-- social_links ----------------------------------------------------------------
DROP POLICY IF EXISTS merged_select_social_links ON public.social_links;
DROP POLICY IF EXISTS social_links_select_anon ON public.social_links;
DROP POLICY IF EXISTS social_links_select_auth ON public.social_links;
CREATE POLICY social_links_select_anon ON public.social_links
  FOR SELECT TO anon
  USING (is_active = true);
CREATE POLICY social_links_select_auth ON public.social_links
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role((select auth.uid()), 'admin'::public.app_role));

-- site_settings ---------------------------------------------------------------
DROP POLICY IF EXISTS merged_select_site_settings ON public.site_settings;
DROP POLICY IF EXISTS site_settings_select_anon ON public.site_settings;
DROP POLICY IF EXISTS site_settings_select_auth ON public.site_settings;
CREATE POLICY site_settings_select_anon ON public.site_settings
  FOR SELECT TO anon
  USING (is_public IS TRUE);
CREATE POLICY site_settings_select_auth ON public.site_settings
  FOR SELECT TO authenticated
  USING (is_public IS TRUE OR public.has_role((select auth.uid()), 'admin'::public.app_role));

-- Guard: fail the migration (and the CI drift check) if any policy granted to
-- anon still references has_role(), so this class of regression cannot ship
-- again silently.
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ')
    INTO _bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
     AND (coalesce(qual, '') ILIKE '%has_role(%' OR coalesce(with_check, '') ILIKE '%has_role(%');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'anon-visible policies still call has_role(): %', _bad;
  END IF;
END $$;
