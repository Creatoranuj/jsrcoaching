
-- Secure increment_book_clicks with auth check and search_path
CREATE OR REPLACE FUNCTION public.increment_book_clicks(book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Fix search_path on update_books_updated_at
CREATE OR REPLACE FUNCTION public.update_books_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
