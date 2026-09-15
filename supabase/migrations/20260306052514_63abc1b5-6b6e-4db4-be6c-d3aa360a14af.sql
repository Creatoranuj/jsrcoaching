
-- Fix receipts bucket: make it private so RLS is enforced
UPDATE storage.buckets SET public = false WHERE id = 'receipts';
