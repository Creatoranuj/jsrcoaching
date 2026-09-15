
-- Step 1: Remove duplicate enrollments, keeping only the EARLIEST row per (user_id, course_id)
DELETE FROM public.enrollments
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, course_id) id
  FROM public.enrollments
  ORDER BY user_id, course_id, purchased_at ASC NULLS LAST, id ASC
);

-- Step 2: Add UNIQUE constraint (idempotent — skips if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrollments_user_id_course_id_unique'
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_user_id_course_id_unique UNIQUE (user_id, course_id);
  END IF;
END;
$$;
