DROP POLICY IF EXISTS "Anyone can view books" ON public.books;
CREATE POLICY "Signed-in users can view books" ON public.books FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.books FROM anon;

DROP POLICY IF EXISTS "Anyone can view chapters" ON public.chapters;
CREATE POLICY "Signed-in users can view chapters" ON public.chapters FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.chapters FROM anon;

DROP POLICY IF EXISTS "Anyone can read active FAQs" ON public.chatbot_faq;
CREATE POLICY "Signed-in users can read active FAQs" ON public.chatbot_faq FOR SELECT TO authenticated USING (is_active = true);
REVOKE SELECT ON public.chatbot_faq FROM anon;

DROP POLICY IF EXISTS "Anyone can view active earning links" ON public.earning_links;
CREATE POLICY "Signed-in users can view active earning links" ON public.earning_links FOR SELECT TO authenticated USING (is_active = true);
REVOKE SELECT ON public.earning_links FROM anon;

DROP POLICY IF EXISTS "Anyone can read active knowledge entries" ON public.knowledge_base;
CREATE POLICY "Signed-in users can read active knowledge entries" ON public.knowledge_base FOR SELECT TO authenticated USING (is_active = true);
REVOKE SELECT ON public.knowledge_base FROM anon;

DROP POLICY IF EXISTS "Anyone can read active plans" ON public.subscription_plans;
CREATE POLICY "Signed-in users can read plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.subscription_plans FROM anon;