
-- Create storage buckets needed by the application
INSERT INTO storage.buckets (id, name, public) VALUES ('course-videos', 'course-videos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('content', 'content', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('notices', 'notices', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('book-covers', 'book-covers', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for course-videos
CREATE POLICY "Anyone can view course videos" ON storage.objects FOR SELECT USING (bucket_id = 'course-videos');
CREATE POLICY "Admins can manage course videos" ON storage.objects FOR ALL USING (bucket_id = 'course-videos' AND public.has_role(auth.uid(), 'admin'));

-- Storage policies for content
CREATE POLICY "Anyone can view content" ON storage.objects FOR SELECT USING (bucket_id = 'content');
CREATE POLICY "Admins can manage content" ON storage.objects FOR ALL USING (bucket_id = 'content' AND public.has_role(auth.uid(), 'admin'));

-- Storage policies for chat-attachments
CREATE POLICY "Authenticated users can view chat attachments" ON storage.objects FOR SELECT USING (bucket_id = 'chat-attachments' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can upload chat attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for notices
CREATE POLICY "Anyone can view notices files" ON storage.objects FOR SELECT USING (bucket_id = 'notices');
CREATE POLICY "Admins can manage notices files" ON storage.objects FOR ALL USING (bucket_id = 'notices' AND public.has_role(auth.uid(), 'admin'));

-- Storage policies for receipts
CREATE POLICY "Users can upload own receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Admins can view all receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'admin'));

-- Storage policies for book-covers
CREATE POLICY "Anyone can view book covers" ON storage.objects FOR SELECT USING (bucket_id = 'book-covers');
CREATE POLICY "Admins can manage book covers" ON storage.objects FOR ALL USING (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'));
