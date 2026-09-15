-- Backfill any NULL status values to a safe default before enforcing NOT NULL
UPDATE public.enrollments
   SET status = 'active'
 WHERE status IS NULL;

-- Enforce NOT NULL + a sensible default going forward
ALTER TABLE public.enrollments
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;