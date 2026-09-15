-- Create missing storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for chat-attachments (private)
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Users can view their own chat attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- RLS policies for book-covers (public read, admin write)
CREATE POLICY "Anyone can view book covers"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'book-covers');

CREATE POLICY "Admins can upload book covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete book covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'));