
-- 1) get_course_bundle: strip paid content for unauthorized callers
CREATE OR REPLACE FUNCTION public.get_course_bundle(_course_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
  _result jsonb;
BEGIN
  _is_priv := (
    _uid IS NOT NULL AND (
      public.has_role(_uid, 'admin'::app_role)
      OR public.has_role(_uid, 'teacher'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE user_id = _uid AND course_id = _course_id AND status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = _course_id AND (c.price IS NULL OR c.price = 0)
      )
    )
  );

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
        'video_url', CASE WHEN _is_priv THEN l.video_url ELSE NULL END,
        'class_pdf_url', CASE WHEN _is_priv THEN l.class_pdf_url ELSE NULL END,
        'transcript_md', CASE WHEN _is_priv THEN l.transcript_md ELSE NULL END
      ) ORDER BY l.position ASC NULLS LAST, l.created_at ASC NULLS LAST)
      FROM public.lessons l
      WHERE l.course_id = _course_id
    ), '[]'::jsonb),
    'is_enrolled', _is_priv
  ) INTO _result;

  RETURN _result;
END;
$$;

-- 2) Enforce user_name from profile on comments/live_messages/community_comments
CREATE OR REPLACE FUNCTION public.enforce_user_name_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _real_name text;
BEGIN
  IF NEW.user_id IS NULL OR auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT full_name INTO _real_name FROM public.profiles WHERE id = NEW.user_id;
  IF _real_name IS NOT NULL AND length(btrim(_real_name)) > 0 THEN
    NEW.user_name := _real_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_enforce_user_name ON public.comments;
CREATE TRIGGER trg_comments_enforce_user_name
BEFORE INSERT OR UPDATE OF user_name ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS trg_live_messages_enforce_user_name ON public.live_messages;
CREATE TRIGGER trg_live_messages_enforce_user_name
BEFORE INSERT OR UPDATE OF user_name ON public.live_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

DROP TRIGGER IF EXISTS trg_community_comments_enforce_user_name ON public.community_comments;
CREATE TRIGGER trg_community_comments_enforce_user_name
BEFORE INSERT OR UPDATE OF user_name ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_name_from_profile();

-- 3) Prevent quiz score tampering
CREATE OR REPLACE FUNCTION public.lock_submitted_quiz_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Once submitted, block any student-side mutation of score fields
  IF OLD.submitted_at IS NOT NULL THEN
    IF NEW.score        IS DISTINCT FROM OLD.score
    OR NEW.percentage   IS DISTINCT FROM OLD.percentage
    OR NEW.passed       IS DISTINCT FROM OLD.passed
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Submitted quiz attempts cannot be modified'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_attempts_lock_score ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_attempts_lock_score
BEFORE UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.lock_submitted_quiz_attempt();

-- Prevent students from inserting a pre-scored attempt: force initial score fields to zero/null
CREATE OR REPLACE FUNCTION public.sanitize_quiz_attempt_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Students may create an in-progress attempt only; score is set server-side by score-quiz.
  NEW.score := 0;
  NEW.percentage := 0;
  NEW.passed := false;
  NEW.submitted_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_attempts_sanitize_insert ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_attempts_sanitize_insert
BEFORE INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.sanitize_quiz_attempt_insert();
