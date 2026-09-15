DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
CREATE POLICY "Public can view public site settings"
ON public.site_settings FOR SELECT
USING (is_public IS TRUE OR public.has_role(auth.uid(), 'admin'));

UPDATE public.landing_courses
SET faculty = replace(faculty, 'JRS Institute Faculty', 'JSR COACHING Faculty')
WHERE faculty ILIKE '%JRS%';