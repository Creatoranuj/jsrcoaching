-- Secure review RPC: returns questions with correct_answer + explanation
-- ONLY when the caller owns the attempt AND the attempt has been submitted.
-- Answer keys stay hidden pre-submission and are never exposed to other users.
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

  -- Owner OR admin/teacher may review; must be submitted.
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

REVOKE ALL ON FUNCTION public.get_quiz_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quiz_review(uuid) TO authenticated;