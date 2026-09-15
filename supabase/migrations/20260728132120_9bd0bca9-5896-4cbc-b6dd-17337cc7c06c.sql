-- 1. Lesson comments: hide support
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_reason text;

CREATE INDEX IF NOT EXISTS comments_lesson_created_idx
  ON public.comments (lesson_id, created_at DESC);

-- 2. SELECT policy: hidden comments only visible to staff (and never to plain students)
DROP POLICY IF EXISTS "Enrolled users and staff can view comments" ON public.comments;

CREATE POLICY "Enrolled users and staff can view comments"
ON public.comments
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR (
    is_hidden = false
    AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM lessons l
        JOIN enrollments e ON e.course_id = l.course_id
        WHERE l.id = comments.lesson_id
          AND e.user_id = auth.uid()
          AND e.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM lessons l
        JOIN courses c ON c.id = l.course_id
        WHERE l.id = comments.lesson_id
          AND (c.price IS NULL OR c.price = 0)
      )
    )
  )
);

-- 3. admin_hide_content: support lesson comments
CREATE OR REPLACE FUNCTION public.admin_hide_content(
  _content_type text, _content_id uuid, _hidden boolean, _reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tbl text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF _content_type = 'post' THEN
    _tbl := 'community_posts';
    UPDATE public.community_posts
       SET is_hidden = _hidden,
           hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
           hidden_reason = CASE WHEN _hidden THEN _reason ELSE NULL END
     WHERE id = _content_id;
  ELSIF _content_type = 'comment' THEN
    _tbl := 'community_comments';
    UPDATE public.community_comments
       SET is_hidden = _hidden,
           hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
           hidden_reason = CASE WHEN _hidden THEN _reason ELSE NULL END
     WHERE id = _content_id;
  ELSIF _content_type = 'reply' THEN
    _tbl := 'doubt_replies';
    UPDATE public.doubt_replies
       SET is_hidden = _hidden,
           hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
           hidden_reason = CASE WHEN _hidden THEN _reason ELSE NULL END
     WHERE id = _content_id;
  ELSIF _content_type = 'lesson_comment' THEN
    _tbl := 'comments';
    UPDATE public.comments
       SET is_hidden = _hidden,
           hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
           hidden_reason = CASE WHEN _hidden THEN _reason ELSE NULL END
     WHERE id = _content_id;
  ELSE
    RAISE EXCEPTION 'invalid content_type: %', _content_type;
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_count)
  VALUES (auth.uid(),
          CASE WHEN _hidden THEN 'content.hide' ELSE 'content.unhide' END,
          _tbl, 1);
END;
$function$;

-- 4. Batch roster for admins
CREATE OR REPLACE FUNCTION public.admin_get_batch_roster(_course_id bigint)
RETURNS TABLE (
  enrollment_id bigint,
  user_id uuid,
  full_name text,
  email text,
  mobile text,
  purchased_at timestamptz,
  status text,
  progress_percentage integer,
  is_blocked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id,
         e.user_id,
         p.full_name,
         p.email,
         p.mobile,
         e.purchased_at,
         e.status,
         COALESCE(e.progress_percentage, 0),
         COALESCE(p.is_blocked, false)
  FROM public.enrollments e
  LEFT JOIN public.profiles p ON p.id = e.user_id
  WHERE e.course_id = _course_id
    AND public.has_role(auth.uid(), 'admin')
  ORDER BY e.purchased_at DESC NULLS LAST
  LIMIT 1000;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_batch_roster(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_batch_roster(bigint) TO authenticated;