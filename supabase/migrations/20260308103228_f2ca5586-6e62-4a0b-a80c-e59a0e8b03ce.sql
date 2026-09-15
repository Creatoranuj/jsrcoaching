
-- Step 1: Delete duplicate enrollments, keeping only the EARLIEST one per (user_id, course_id)
DELETE FROM public.enrollments
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, course_id) id
  FROM public.enrollments
  ORDER BY user_id, course_id, purchased_at ASC NULLS LAST
);

-- Step 2: Add UNIQUE constraint to prevent future duplicates at DB level
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_user_id_course_id_unique UNIQUE (user_id, course_id);
