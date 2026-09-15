
-- ============ Track A: user block ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_by uuid;

-- ============ Track B: hide flags ============
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_reason text;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_reason text;

ALTER TABLE public.doubt_replies
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_reason text;

-- ============ Reports queue ============
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('post','comment','reply')),
  content_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

GRANT SELECT, INSERT ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own report" ON public.content_reports;
CREATE POLICY "insert own report" ON public.content_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "admin read all reports" ON public.content_reports;
CREATE POLICY "admin read all reports" ON public.content_reports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin update reports" ON public.content_reports;
CREATE POLICY "admin update reports" ON public.content_reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
  ON public.content_reports (status, created_at DESC);

-- ============ Block-check helper (SECURITY DEFINER) ============
CREATE OR REPLACE FUNCTION public.is_user_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_blocked FROM public.profiles WHERE id = _user_id), false)
$$;
REVOKE EXECUTE ON FUNCTION public.is_user_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_blocked(uuid) TO authenticated;

-- ============ Trigger: reject writes from blocked users ============
CREATE OR REPLACE FUNCTION public.enforce_not_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_user_blocked(auth.uid()) THEN
    RAISE EXCEPTION 'User is blocked from posting' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_check_posts ON public.community_posts;
CREATE TRIGGER trg_block_check_posts
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_not_blocked();

DROP TRIGGER IF EXISTS trg_block_check_comments ON public.community_comments;
CREATE TRIGGER trg_block_check_comments
  BEFORE INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_not_blocked();

DROP TRIGGER IF EXISTS trg_block_check_doubts ON public.doubts;
CREATE TRIGGER trg_block_check_doubts
  BEFORE INSERT ON public.doubts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_not_blocked();

DROP TRIGGER IF EXISTS trg_block_check_messages ON public.messages;
CREATE TRIGGER trg_block_check_messages
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_not_blocked();

-- ============ Admin RPCs ============
CREATE OR REPLACE FUNCTION public.admin_set_user_block(
  _user_id uuid,
  _blocked boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET is_blocked = _blocked,
         blocked_at = CASE WHEN _blocked THEN now() ELSE NULL END,
         blocked_reason = CASE WHEN _blocked THEN _reason ELSE NULL END,
         blocked_by = CASE WHEN _blocked THEN auth.uid() ELSE NULL END
   WHERE id = _user_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(),
          CASE WHEN _blocked THEN 'user.block' ELSE 'user.unblock' END,
          'profile', _user_id,
          jsonb_build_object('reason', _reason));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_block(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_block(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_hide_content(
  _content_type text,
  _content_id uuid,
  _hidden boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF _content_type = 'post' THEN
    UPDATE public.community_posts
       SET is_hidden = _hidden,
           hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
           hidden_reason = CASE WHEN _hidden THEN _reason ELSE NULL END
     WHERE id = _content_id;
  ELSIF _content_type = 'comment' THEN
    UPDATE public.community_comments
       SET is_hidden = _hidden,
           hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
           hidden_reason = CASE WHEN _hidden THEN _reason ELSE NULL END
     WHERE id = _content_id;
  ELSIF _content_type = 'reply' THEN
    UPDATE public.doubt_replies
       SET is_hidden = _hidden,
           hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
           hidden_reason = CASE WHEN _hidden THEN _reason ELSE NULL END
     WHERE id = _content_id;
  ELSE
    RAISE EXCEPTION 'invalid content_type: %', _content_type;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(),
          CASE WHEN _hidden THEN 'content.hide' ELSE 'content.unhide' END,
          _content_type, _content_id,
          jsonb_build_object('reason', _reason));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_hide_content(text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_hide_content(text, uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  _report_id uuid,
  _status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('resolved','dismissed') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE public.content_reports
     SET status = _status,
         resolved_at = now(),
         resolved_by = auth.uid()
   WHERE id = _report_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) TO authenticated;

-- ============ Admin drill-down RPC: full user snapshot ============
CREATE OR REPLACE FUNCTION public.admin_get_user_snapshot(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id),
    'enrollments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'course_id', e.course_id,
        'course_title', c.title,
        'enrolled_at', e.created_at
      ))
      FROM public.enrollments e
      LEFT JOIN public.courses c ON c.id = e.course_id
      WHERE e.user_id = _user_id
    ), '[]'::jsonb),
    'batch_count', (SELECT count(*) FROM public.enrollments WHERE user_id = _user_id),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rp.id,
        'amount', rp.amount,
        'status', rp.status,
        'created_at', rp.created_at
      ) ORDER BY rp.created_at DESC)
      FROM public.razorpay_payments rp
      WHERE rp.user_id = _user_id
    ), '[]'::jsonb),
    'total_spent', COALESCE((
      SELECT sum(amount) FROM public.razorpay_payments
      WHERE user_id = _user_id AND status IN ('captured','paid','success')
    ), 0),
    'lessons_completed', (
      SELECT count(*) FROM public.user_progress WHERE user_id = _user_id AND completed = true
    ),
    'quiz_attempts', (
      SELECT count(*) FROM public.quiz_attempts WHERE user_id = _user_id
    ),
    'last_session', (
      SELECT to_jsonb(s) FROM public.user_sessions s
      WHERE s.user_id = _user_id ORDER BY s.created_at DESC LIMIT 1
    )
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_snapshot(uuid) TO authenticated;
