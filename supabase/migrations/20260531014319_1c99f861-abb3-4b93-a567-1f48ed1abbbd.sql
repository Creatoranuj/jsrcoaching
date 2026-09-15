-- Enable pg_trgm in the extensions schema (Supabase managed)
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Trigram indexes for fast fuzzy search on lesson title + description
CREATE INDEX IF NOT EXISTS lessons_title_trgm_idx
  ON public.lessons USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS lessons_description_trgm_idx
  ON public.lessons USING gin (description extensions.gin_trgm_ops);

-- SECURITY DEFINER search function: ranked fuzzy match over lessons.
-- Returns only unlocked lessons (mirrors most app reads). Caller must be
-- authenticated — anon search is intentionally not exposed.
CREATE OR REPLACE FUNCTION public.search_lectures(
  _query text,
  _limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  course_id bigint,
  chapter_id uuid,
  lecture_type text,
  thumbnail_url text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    l.id,
    l.title,
    l.description,
    l.course_id,
    l.chapter_id,
    l.lecture_type,
    l.thumbnail_url,
    GREATEST(
      similarity(l.title, _query),
      similarity(COALESCE(l.description, ''), _query) * 0.6
    ) AS rank
  FROM public.lessons l
  WHERE
    (l.is_locked IS DISTINCT FROM TRUE)
    AND (
      l.title ILIKE '%' || _query || '%'
      OR l.description ILIKE '%' || _query || '%'
      OR similarity(l.title, _query) > 0.2
    )
  ORDER BY rank DESC, l.created_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

-- Lock down execution: authenticated users only (no anon, no public).
REVOKE ALL ON FUNCTION public.search_lectures(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, int) TO service_role;