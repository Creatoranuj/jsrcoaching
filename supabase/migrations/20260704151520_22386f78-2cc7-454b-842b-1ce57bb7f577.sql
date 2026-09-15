UPDATE public.courses SET price = 0 WHERE price IS NULL;
ALTER TABLE public.courses ALTER COLUMN price SET DEFAULT 0;
ALTER TABLE public.courses ALTER COLUMN price SET NOT NULL;
ALTER TABLE public.courses ADD CONSTRAINT courses_price_non_negative CHECK (price >= 0);