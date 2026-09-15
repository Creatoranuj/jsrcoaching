-- Fix 1: Drop the two loose/overly-permissive comment policies
DROP POLICY IF EXISTS "Users can update their comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete their comments" ON public.comments;

-- Fix 2: Ensure receipts bucket is private (bypass public URL access)
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- Fix 3: Grant profiles_public read access to authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;