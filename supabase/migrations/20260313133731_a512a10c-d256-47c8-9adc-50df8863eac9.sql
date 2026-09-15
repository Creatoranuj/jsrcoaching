
-- Grant service_role explicit access to knowledge_base
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.knowledge_base TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
