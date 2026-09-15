-- 1. Fix receipts storage RLS: Add policies for receipts bucket
CREATE POLICY "Users can upload own receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'receipts' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'receipts' 
  AND (auth.uid()::text = (storage.foldername(name))[1]
       OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
);

CREATE POLICY "Users can delete own receipts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'receipts' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 2. Fix profiles: Drop overly permissive policy if it exists
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- 3. Fix increment_book_clicks: Switch to SECURITY INVOKER with search_path
CREATE OR REPLACE FUNCTION public.increment_book_clicks(book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    UPDATE public.books
    SET click_count = click_count + 1
    WHERE id = book_id;
END;
$$;
