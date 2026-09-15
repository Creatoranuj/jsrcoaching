CREATE TABLE IF NOT EXISTS public.crawl_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  knowledge_entries_created integer NOT NULL DEFAULT 0,
  crawled_at timestamp with time zone NOT NULL DEFAULT now(),
  crawled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  error_message text,
  title text,
  content_preview text
);

ALTER TABLE public.crawl_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage crawl history"
  ON public.crawl_history
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_crawl_history_crawled_by ON public.crawl_history(crawled_by);
CREATE INDEX IF NOT EXISTS idx_crawl_history_crawled_at ON public.crawl_history(crawled_at DESC);