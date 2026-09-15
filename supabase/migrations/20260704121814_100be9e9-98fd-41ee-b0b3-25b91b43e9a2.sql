
DROP POLICY IF EXISTS "Users self-enroll: free or paid-verified" ON public.enrollments;

UPDATE public.enrollments SET status = 'active' WHERE status IS NULL;
ALTER TABLE public.enrollments ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.enrollments ALTER COLUMN status SET NOT NULL;
