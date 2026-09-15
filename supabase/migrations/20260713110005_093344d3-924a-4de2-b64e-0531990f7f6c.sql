
-- Scope write/select policies to authenticated to reduce public-role exposure

-- app_config write policies
DROP POLICY IF EXISTS "app_config insertable by admins" ON public.app_config;
CREATE POLICY "app_config insertable by admins" ON public.app_config
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "app_config updatable by admins" ON public.app_config;
CREATE POLICY "app_config updatable by admins" ON public.app_config
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- site_settings admin manage policy
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
CREATE POLICY "Admins can manage site settings" ON public.site_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- students manage policy
DROP POLICY IF EXISTS "Admins and teachers can manage students" ON public.students;
CREATE POLICY "Admins and teachers can manage students" ON public.students
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- user_subscriptions own-view policy
DROP POLICY IF EXISTS "Users view own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users view own subscriptions" ON public.user_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Public marketing/content SELECT policies: scope to anon+authenticated explicitly (drop {public} role catch-all)
DROP POLICY IF EXISTS "Anyone can view chapters" ON public.chapters;
CREATE POLICY "Anyone can view chapters" ON public.chapters
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view courses" ON public.courses;
CREATE POLICY "Anyone can view courses" ON public.courses
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view books" ON public.books;
CREATE POLICY "Anyone can view books" ON public.books
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public Read Content" ON public.landing_content;
CREATE POLICY "Public Read Content" ON public.landing_content
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.site_stats;
CREATE POLICY "Enable read access for all users" ON public.site_stats
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read active FAQs" ON public.chatbot_faq;
CREATE POLICY "Anyone can read active FAQs" ON public.chatbot_faq
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view active banners" ON public.hero_banners;
CREATE POLICY "Anyone can view active banners" ON public.hero_banners
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read active knowledge entries" ON public.knowledge_base;
CREATE POLICY "Anyone can read active knowledge entries" ON public.knowledge_base
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read active plans" ON public.subscription_plans;
CREATE POLICY "Anyone can read active plans" ON public.subscription_plans
  FOR SELECT TO anon, authenticated USING (true);
