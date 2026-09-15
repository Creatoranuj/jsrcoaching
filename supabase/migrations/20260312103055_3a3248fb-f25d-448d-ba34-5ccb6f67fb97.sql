
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding extensions.vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (id uuid, title text, content text, category text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT kb.id, kb.title, kb.content, kb.category,
    (1 - (kb.embedding OPERATOR(extensions.<=>) query_embedding))::float AS similarity
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding OPERATOR(extensions.<=>) query_embedding)) > match_threshold
  ORDER BY kb.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$$;
