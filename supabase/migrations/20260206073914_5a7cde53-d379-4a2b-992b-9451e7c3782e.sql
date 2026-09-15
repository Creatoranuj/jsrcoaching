-- Make sensitive storage buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('course-videos', 'course-materials', 'receipts');
