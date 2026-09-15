-- Create content storage bucket for video and PDF uploads (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('content', 'content', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for content bucket
CREATE POLICY "Admins can upload content files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'content' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update content files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'content' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete content files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'content' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Anyone can view content files"
ON storage.objects FOR SELECT
USING (bucket_id = 'content');