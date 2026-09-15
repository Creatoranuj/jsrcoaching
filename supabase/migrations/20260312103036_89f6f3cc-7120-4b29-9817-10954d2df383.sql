
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding extensions.vector(768);
