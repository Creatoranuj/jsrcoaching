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

CREATE OR REPLACE FUNCTION public.admin_revoke_enrollment(_enrollment_id bigint, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _user uuid; _course bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollments SET status = 'revoked'
   WHERE id = _enrollment_id
   RETURNING user_id, course_id INTO _user, _course;

  IF _user IS NULL THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'enrollment.revoke', 'enrollment', _user,
          jsonb_build_object('enrollment_id', _enrollment_id, 'course_id', _course, 'reason', _reason));
END;
$$;

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
                  similarity(COALESCE(l.description, ''), _query) * 0.6) AS rank
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

CREATE OR REPLACE FUNCTION public.admin_get_suspicious_enrollments(_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  WITH whitelisted AS (
    SELECT (metadata->>'enrollment_id')::bigint AS enrollment_id
    FROM public.audit_log
    WHERE action IN ('enrollment.legit','enrollment.grant')
      AND metadata ? 'enrollment_id'
  ),
  base AS (
    SELECT e.id, e.user_id, e.course_id, e.status, e.purchased_at,
           c.title AS course_title, COALESCE(c.price, 0) AS course_price,
           p.full_name, p.email, p.mobile, p.is_blocked
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.profiles p ON p.id = e.user_id
    WHERE e.status = 'active'
      AND COALESCE(c.price, 0) > 0
      AND e.id NOT IN (SELECT enrollment_id FROM whitelisted WHERE enrollment_id IS NOT NULL)
  ),
  pay_agg AS (
    SELECT b.id AS enrollment_id,
           (SELECT count(*) FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.course_id = b.course_id
                AND rp.status IN ('captured','paid','success')) AS ok_count,
           (SELECT max(rp.amount) FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.course_id = b.course_id
                AND rp.status IN ('captured','paid','success')) AS max_ok_amount,
           (SELECT count(*) FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.status IN ('captured','paid','success')) AS any_paid_count,
           (SELECT rp.status FROM public.razorpay_payments rp
              WHERE rp.user_id = b.user_id AND rp.course_id = b.course_id
              ORDER BY rp.created_at DESC LIMIT 1) AS latest_status
    FROM base b
  ),
  dup_orders AS (
    SELECT razorpay_order_id
    FROM public.razorpay_payments
    WHERE razorpay_order_id IS NOT NULL
    GROUP BY razorpay_order_id
    HAVING count(DISTINCT user_id) > 1
  ),
  dup_flag AS (
    SELECT DISTINCT b.id AS enrollment_id
    FROM base b
    JOIN public.razorpay_payments rp ON rp.user_id = b.user_id AND rp.course_id = b.course_id
    JOIN dup_orders d ON d.razorpay_order_id = rp.razorpay_order_id
  ),
  velocity AS (
    SELECT user_id, count(*) AS burst
    FROM public.enrollments
    WHERE purchased_at > now() - interval '10 minutes'
    GROUP BY user_id
    HAVING count(*) > 5
  ),
  flagged AS (
    SELECT b.*, pa.ok_count, pa.max_ok_amount, pa.any_paid_count, pa.latest_status,
      CASE
        WHEN df.enrollment_id IS NOT NULL THEN 'duplicate_order'
        WHEN pa.ok_count = 0 AND pa.any_paid_count = 0 THEN 'no_payment'
        WHEN pa.ok_count = 0 AND pa.any_paid_count > 0 THEN 'payment_for_wrong_course'
        WHEN pa.ok_count = 0 AND pa.latest_status IN ('failed','refunded') THEN 'payment_failed'
        WHEN pa.ok_count > 0 AND pa.max_ok_amount < b.course_price * 0.9 THEN 'amount_mismatch'
        WHEN v.user_id IS NOT NULL THEN 'velocity'
        ELSE NULL
      END AS rule,
      CASE
        WHEN df.enrollment_id IS NOT NULL THEN 'critical'
        WHEN pa.ok_count = 0 AND pa.any_paid_count = 0 THEN 'critical'
        WHEN pa.ok_count = 0 THEN 'high'
        WHEN pa.ok_count > 0 AND pa.max_ok_amount < b.course_price * 0.9 THEN 'high'
        WHEN v.user_id IS NOT NULL THEN 'medium'
        ELSE 'low'
      END AS severity
    FROM base b
    LEFT JOIN pay_agg pa ON pa.enrollment_id = b.id
    LEFT JOIN dup_flag df ON df.enrollment_id = b.id
    LEFT JOIN velocity v ON v.user_id = b.user_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    purchased_at DESC), '[]'::jsonb)
  INTO _result
  FROM (SELECT * FROM flagged WHERE rule IS NOT NULL LIMIT _limit) f;

  RETURN _result;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_mark_enrollment_legit(_enrollment_id bigint, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO _user FROM public.enrollments WHERE id = _enrollment_id;
  IF _user IS NULL THEN RAISE EXCEPTION 'enrollment not found'; END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'enrollment.legit', 'enrollment', _user,
          jsonb_build_object('enrollment_id', _enrollment_id, 'note', _note));
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_get_user_snapshot(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'enrolled_at', e.purchased_at
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
      WHERE s.user_id = _user_id ORDER BY s.logged_in_at DESC LIMIT 1
    )
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_course_lesson_stats()
RETURNS TABLE(course_id bigint, lesson_count bigint, total_duration bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT l.course_id,
           COUNT(*)::bigint AS lesson_count,
           COALESCE(SUM(l.duration), 0)::bigint AS total_duration
    FROM public.lessons l
    WHERE l.course_id IS NOT NULL
    GROUP BY l.course_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot()
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
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  WITH my_enrollments AS (
    SELECT e.id, e.course_id, e.status, e.progress_percentage,
           e.purchased_at, e.last_watched_lesson_id,
           c.title, c.description, c.grade, c.image_url, c.thumbnail_url
    FROM public.enrollments e
    LEFT JOIN public.courses c ON c.id = e.course_id
    WHERE e.user_id = _uid AND e.status = 'active'
  ),
  course_lessons AS (
    SELECT l.id, l.course_id
    FROM public.lessons l
    WHERE l.course_id IN (SELECT course_id FROM my_enrollments WHERE course_id IS NOT NULL)
  ),
  my_progress AS (
    SELECT lesson_id, course_id, completed
    FROM public.user_progress
    WHERE user_id = _uid
  )
  SELECT jsonb_build_object(
    'enrollments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', me.id,
        'course_id', me.course_id,
        'status', me.status,
        'progress_percentage', me.progress_percentage,
        'purchased_at', me.purchased_at,
        'last_watched_lesson_id', me.last_watched_lesson_id,
        'course', jsonb_build_object(
          'id', me.course_id,
          'title', me.title,
          'description', me.description,
          'grade', me.grade,
          'image_url', me.image_url,
          'thumbnail_url', me.thumbnail_url
        )
      ) ORDER BY me.purchased_at DESC NULLS LAST)
      FROM my_enrollments me
    ), '[]'::jsonb),
    'course_lessons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cl.id, 'course_id', cl.course_id))
      FROM course_lessons cl
    ), '[]'::jsonb),
    'user_progress', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lesson_id', mp.lesson_id,
        'course_id', mp.course_id,
        'completed', mp.completed
      ))
      FROM my_progress mp
    ), '[]'::jsonb),
    'lesson_progress_count', (SELECT count(*) FROM public.lesson_progress WHERE user_id = _uid),
    'lessons_completed', (SELECT count(*) FROM public.lesson_progress WHERE user_id = _uid AND completed = true),
    'quiz_stats', (
      SELECT jsonb_build_object(
        'attempts', count(*),
        'passed', count(*) FILTER (WHERE passed = true),
        'avg_percentage', COALESCE(round(avg(percentage)::numeric, 2), 0)
      )
      FROM public.quiz_attempts
      WHERE user_id = _uid AND submitted_at IS NOT NULL
    ),
    'recent_quiz_attempts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', qa.id,
        'quiz_id', qa.quiz_id,
        'score', qa.score,
        'percentage', qa.percentage,
        'passed', qa.passed,
        'submitted_at', qa.submitted_at,
        'created_at', qa.created_at,
        'quizzes', CASE WHEN qz.id IS NULL THEN NULL ELSE
          jsonb_build_object('title', qz.title, 'type', qz.type, 'total_marks', qz.total_marks)
        END
      ) ORDER BY qa.created_at DESC)
      FROM (
        SELECT * FROM public.quiz_attempts
        WHERE user_id = _uid AND submitted_at IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 10
      ) qa
      LEFT JOIN public.quizzes qz ON qz.id = qa.quiz_id
    ), '[]'::jsonb),
    'upcoming_doubts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ds.id,
        'subject', ds.subject,
        'scheduled_at', ds.scheduled_at,
        'zoom_join_url', ds.zoom_join_url,
        'status', ds.status
      ) ORDER BY ds.scheduled_at ASC)
      FROM (
        SELECT id, subject, scheduled_at, zoom_join_url, status
        FROM public.doubt_sessions
        WHERE student_id = _uid AND status IN ('scheduled', 'active')
        ORDER BY scheduled_at ASC
        LIMIT 3
      ) ds
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.get_quiz_questions(_quiz_id uuid)
 RETURNS TABLE(id uuid, quiz_id uuid, question_text text, question_type text, options jsonb, marks integer, negative_marks integer, order_index integer, image_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _course_id bigint;
  _published boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT q.course_id, q.is_published INTO _course_id, _published
    FROM public.quizzes q WHERE q.id = _quiz_id;

  IF _course_id IS NULL AND _published IS NULL THEN
    RAISE EXCEPTION 'Quiz not found' USING ERRCODE = '42704';
  END IF;

  IF NOT (
       public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'teacher'::app_role)
    OR (
      COALESCE(_published, false)
      AND (
        _course_id IS NULL
        OR EXISTS (SELECT 1 FROM public.enrollments e
                    WHERE e.user_id = _uid AND e.course_id = _course_id AND e.status = 'active')
        OR EXISTS (SELECT 1 FROM public.courses c
                    WHERE c.id = _course_id AND (c.price IS NULL OR c.price = 0))
      )
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT q.id, q.quiz_id, q.question_text, q.question_type,
           q.options, q.marks, q.negative_marks, q.order_index, q.image_url
      FROM public.questions q
     WHERE q.quiz_id = _quiz_id
     ORDER BY q.order_index;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_quiz_review(_attempt_id uuid)
RETURNS TABLE (
  id uuid,
  quiz_id uuid,
  question_text text,
  question_type text,
  options jsonb,
  correct_answer text,
  explanation text,
  marks integer,
  negative_marks integer,
  order_index integer,
  image_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _attempt_user uuid;
  _attempt_quiz uuid;
  _submitted_at timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT qa.user_id, qa.quiz_id, qa.submitted_at
    INTO _attempt_user, _attempt_quiz, _submitted_at
    FROM public.quiz_attempts qa
   WHERE qa.id = _attempt_id;

  IF _attempt_user IS NULL THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = '42704';
  END IF;

  IF _attempt_user <> _uid
     AND NOT public.has_role(_uid, 'admin'::app_role)
     AND NOT public.has_role(_uid, 'teacher'::app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF _submitted_at IS NULL THEN
    RAISE EXCEPTION 'Attempt not yet submitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT q.id, q.quiz_id, q.question_text, q.question_type,
           q.options, q.correct_answer, q.explanation,
           q.marks, q.negative_marks, q.order_index, q.image_url
      FROM public.questions q
     WHERE q.quiz_id = _attempt_quiz
     ORDER BY q.order_index;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hide_content(text, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_enrollment(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_lectures(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_batch_roster(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_suspicious_enrollments(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_block(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_enrollment_legit(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_report(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user_snapshot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_course_lesson_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dashboard_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_course_bundle(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quiz_review(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_hide_content(text, uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_enrollment(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_batch_roster(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_suspicious_enrollments(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_block(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_enrollment_legit(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_course_bundle(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_quiz_review(uuid) TO authenticated, service_role;

ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_quiz_id_fkey
  FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;