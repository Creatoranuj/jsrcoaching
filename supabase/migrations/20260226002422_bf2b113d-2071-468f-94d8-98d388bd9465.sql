
-- Fix storage bucket SELECT policies: restrict to authenticated users only
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Content is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view course videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view course materials" ON storage.objects;
DROP POLICY IF EXISTS "Public can view content" ON storage.objects;

-- Also drop any other SELECT policies on these buckets
DROP POLICY IF EXISTS "course-videos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "course-materials are publicly accessible" ON storage.objects;

-- Create authenticated-only SELECT policies
CREATE POLICY "Authenticated users can view content"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'content'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can view course videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'course-videos'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can view course materials"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'course-materials'
  AND auth.role() = 'authenticated'
);
