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
      WHERE s.user_id = _user_id ORDER BY s.created_at DESC LIMIT 1
    )
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_snapshot(uuid) TO authenticated;