
-- Create missing storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('comment-images', 'comment-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('course-materials', 'course-materials', true);

-- RLS for comment-images: authenticated users can upload, anyone can read
CREATE POLICY "Public read comment-images" ON storage.objects FOR SELECT USING (bucket_id = 'comment-images');
CREATE POLICY "Auth users upload comment-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comment-images');
CREATE POLICY "Users delete own comment-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'comment-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS for course-materials: authenticated read, admin/teacher manage
CREATE POLICY "Auth read course-materials" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'course-materials');
CREATE POLICY "Admin upload course-materials" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'course-materials' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')));
CREATE POLICY "Admin delete course-materials" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'course-materials' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')));
