-- Tighten public bucket listing policies (security warning fix)
-- Public file URLs still work via CDN; only API-based listing is restricted to admins.

DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view content files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view comment images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read lecture-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view book covers" ON storage.objects;

-- Replace with admin-only listing (public URL reads still work since buckets are public)
CREATE POLICY "Admins can list avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can list own avatar"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can list content"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'content' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can list comment images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comment-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can list lecture-pdfs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lecture-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can list book covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'));

-- Seed 1 hero banner
INSERT INTO public.hero_banners (title, subtitle, cta_text, cta_link, bg_color, position, is_active, badge_text)
SELECT 'Naveen Bharat NEET 2026 Batch', 'Live + Recorded classes by top mentors', 'Enroll Now', '/courses', '#0f172a', 1, true, 'NEW'
WHERE NOT EXISTS (SELECT 1 FROM public.hero_banners);

-- Seed welcome notice
INSERT INTO public.notices (title, content, is_pinned)
SELECT 'Welcome to Naveen Bharat!', 'Aapka swaagat hai. Apne courses dashboard se access karein aur live classes join karein.', true
WHERE NOT EXISTS (SELECT 1 FROM public.notices);