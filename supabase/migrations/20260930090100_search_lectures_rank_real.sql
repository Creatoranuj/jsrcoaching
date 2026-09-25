-- Fix: public.search_lectures() failed at runtime for every caller with
--   42804 structure of query does not match function result type
--   "Returned type double precision does not match expected type real in column 8"
-- because `similarity(...) * 0.6` is real * numeric -> double precision, so
-- GREATEST(real, double precision) is double precision while the RETURNS TABLE
-- declares `rank real`. Cast the expression back to real. Grants are kept by
-- CREATE OR REPLACE (authenticated + service_role only; anon revoked).

CREATE OR REPLACE FUNCTION public.search_lectures(_query text, _limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, description text, course_id bigint, chapter_id uuid, lecture_type text, thumbnail_url text, rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, l.title, l.description, l.course_id, l.chapter_id,
         l.lecture_type, l.thumbnail_url,
         GREATEST(similarity(l.title, _query),
                  (similarity(COALESCE(l.description, ''), _query) * 0.6)::real)::real AS rank
  FROM public.lessons l
  WHERE (l.is_locked IS DISTINCT FROM TRUE)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'teacher'::app_role)
      OR EXISTS (SELECT 1 FROM public.enrollments e
                  WHERE e.user_id = auth.uid() AND e.course_id = l.course_id AND e.status = 'active')
      OR EXISTS (SELECT 1 FROM public.courses c
                  WHERE c.id = l.course_id AND (c.price IS NULL OR c.price = 0))
    )
    AND (
      l.title ILIKE '%' || _query || '%'
      OR l.description ILIKE '%' || _query || '%'
      OR similarity(l.title, _query) > 0.2
    )
  ORDER BY rank DESC, l.created_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 50));
END;
$function$;

REVOKE ALL ON FUNCTION public.search_lectures(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer) TO authenticated, service_role;
