
-- 1. chatbot_faq: filter is_active
DROP POLICY IF EXISTS "Anyone can read active FAQs" ON public.chatbot_faq;
CREATE POLICY "Anyone can read active FAQs" ON public.chatbot_faq
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- 2. hero_banners: filter is_active
DROP POLICY IF EXISTS "Anyone can view active banners" ON public.hero_banners;
CREATE POLICY "Anyone can view active banners" ON public.hero_banners
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- 3. knowledge_base: filter is_active
DROP POLICY IF EXISTS "Anyone can read active knowledge entries" ON public.knowledge_base;
CREATE POLICY "Anyone can read active knowledge entries" ON public.knowledge_base
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- 4. earning_links: extend to anon
DROP POLICY IF EXISTS "Anyone can view active earning links" ON public.earning_links;
CREATE POLICY "Anyone can view active earning links" ON public.earning_links
  FOR SELECT TO anon, authenticated
  USING (is_active = true);
GRANT SELECT ON public.earning_links TO anon;

-- 5. messages: simplify recipient update policy (trigger enforce_message_recipient_readonly already prevents tampering)
DROP POLICY IF EXISTS "Recipients can mark received messages as read" ON public.messages;
CREATE POLICY "Recipients can mark received messages as read" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Ensure the readonly-enforcement trigger exists on messages
DROP TRIGGER IF EXISTS trg_enforce_message_recipient_readonly ON public.messages;
CREATE TRIGGER trg_enforce_message_recipient_readonly
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_recipient_readonly();

-- 6. storage.objects: scope policies to authenticated role
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can upload own receipts" ON storage.objects;
CREATE POLICY "Users can upload own receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view own receipts" ON storage.objects;
CREATE POLICY "Users can view own receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Admins can view all receipts" ON storage.objects;
CREATE POLICY "Admins can view all receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Read comment-images if owner or attached to a comment" ON storage.objects;
CREATE POLICY "Read comment-images if owner or attached to a comment" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comment-images'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.comments c
        WHERE c.image_url IS NOT NULL
          AND c.image_url = ('comment-images/' || objects.name)
      )
    )
  );
