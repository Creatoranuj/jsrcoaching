
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

  INSERT INTO public.audit_log (user_id, action, table_name, record_count)
  VALUES (auth.uid(),
          CASE WHEN _blocked THEN 'user.block' ELSE 'user.unblock' END,
          'profiles', 1);
END;
$$;

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
  ELSE
    RAISE EXCEPTION 'invalid content_type: %', _content_type;
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_count)
  VALUES (auth.uid(),
          CASE WHEN _hidden THEN 'content.hide' ELSE 'content.unhide' END,
          _tbl, 1);
END;
$$;
