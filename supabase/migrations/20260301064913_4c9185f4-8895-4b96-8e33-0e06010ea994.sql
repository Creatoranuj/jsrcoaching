
-- Add image_url column to comments table
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS image_url text;

-- Create comment-images storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('comment-images', 'comment-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for comment-images bucket
CREATE POLICY "Authenticated users can upload comment images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'comment-images');

CREATE POLICY "Anyone can view comment images"
ON storage.objects FOR SELECT
USING (bucket_id = 'comment-images');

CREATE POLICY "Users can delete own comment images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'comment-images' AND (storage.foldername(name))[1] = auth.uid()::text);
