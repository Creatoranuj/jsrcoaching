-- Migration: Rename parent_name to student_name in leads table
-- Step 1: Add new column
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS student_name text;

-- Step 2: Copy data from parent_name to student_name
UPDATE public.leads SET student_name = parent_name WHERE student_name IS NULL;

-- Step 3: Make student_name NOT NULL (after data migration)
ALTER TABLE public.leads ALTER COLUMN student_name SET NOT NULL;

-- Step 4: Drop the old column
ALTER TABLE public.leads DROP COLUMN IF EXISTS parent_name;