-- Question images live in the `content` bucket. The 2026-09-17 storage
-- hardening removed the blanket authenticated read on `content`, which also
-- cut off legacy question images stored under `questions/...` (new uploads go
-- to `thumbnails/questions/...`, already covered). Restore a narrow read for
-- signed-in users on that single prefix only.
CREATE POLICY "content_question_images_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'content'
  AND (storage.foldername(name))[1] = 'questions'
);
