-- Step 1: Remove duplicate enrollments, keep the earliest per (user_id, course_id)
DELETE FROM enrollments
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, course_id) id
  FROM enrollments
  ORDER BY user_id, course_id, purchased_at ASC NULLS LAST
);

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE enrollments
ADD CONSTRAINT unique_user_course UNIQUE (user_id, course_id);