DROP POLICY IF EXISTS "Read comment-images if owner or attached to a comment" ON storage.objects;

CREATE POLICY "Read comment-images if owner or attached to a comment"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'comment-images'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.image_url IS NOT NULL
        AND c.image_url = 'comment-images/' || objects.name
    )
  )
);