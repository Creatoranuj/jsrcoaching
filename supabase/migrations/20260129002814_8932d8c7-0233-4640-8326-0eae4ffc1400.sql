-- Create books table for storing book information
CREATE TABLE public.books (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    author text NOT NULL,
    description text NOT NULL CHECK (char_length(description) <= 300),
    cover_url text NOT NULL,
    amazon_url text NOT NULL CHECK (amazon_url LIKE '%amazon.%'),
    genre text,
    position integer DEFAULT 0,
    click_count integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Anyone can view books (public display)
CREATE POLICY "Anyone can view books"
ON public.books FOR SELECT
USING (true);

-- Only admins can insert books
CREATE POLICY "Admins can insert books"
ON public.books FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Only admins can update books
CREATE POLICY "Admins can update books"
ON public.books FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Only admins can delete books
CREATE POLICY "Admins can delete books"
ON public.books FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create storage bucket for book covers
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('book-covers', 'book-covers', true, 2097152)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for book covers
CREATE POLICY "Anyone can view book covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'book-covers');

CREATE POLICY "Admins can upload book covers"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'book-covers' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update book covers"
ON storage.objects FOR UPDATE
USING (bucket_id = 'book-covers' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete book covers"
ON storage.objects FOR DELETE
USING (bucket_id = 'book-covers' AND has_role(auth.uid(), 'admin'));

-- Function to increment click count
CREATE OR REPLACE FUNCTION public.increment_book_clicks(book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.books
    SET click_count = click_count + 1
    WHERE id = book_id;
END;
$$;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_books_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_books_timestamp
BEFORE UPDATE ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.update_books_updated_at();