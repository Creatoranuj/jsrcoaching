
CREATE OR REPLACE FUNCTION public.get_course_bundle(_course_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'course', (
      SELECT to_jsonb(c) - 'created_at'
      FROM (
        SELECT id, title, grade, description, image_url, thumbnail_url
        FROM public.courses WHERE id = _course_id
      ) c
    ),
    'chapters', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ch.id, 'code', ch.code, 'title', ch.title, 'parent_id', ch.parent_id
      ) ORDER BY ch.position ASC NULLS LAST)
      FROM public.chapters ch
      WHERE ch.course_id = _course_id
    ), '[]'::jsonb),
    'lessons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'is_locked', l.is_locked,
        'description', l.description,
        'overview', l.overview,
        'course_id', l.course_id,
        'chapter_id', l.chapter_id,
        'created_at', l.created_at,
        'like_count', l.like_count,
        'position', l.position,
        'lecture_type', l.lecture_type,
        'thumbnail_url', l.thumbnail_url,
        'video_url', l.video_url,
        'class_pdf_url', l.class_pdf_url,
        'transcript_md', l.transcript_md
      ) ORDER BY l.position ASC NULLS LAST, l.created_at ASC NULLS LAST)
      FROM public.lessons l
      WHERE l.course_id = _course_id
    ), '[]'::jsonb),
    'is_enrolled', (
      _uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE user_id = _uid AND course_id = _course_id AND status = 'active'
      )
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_course_bundle(bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_course_bundle(bigint) TO authenticated, anon;
