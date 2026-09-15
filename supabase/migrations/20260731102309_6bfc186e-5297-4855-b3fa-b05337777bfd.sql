-- 1. Profiles: enforce one row per user
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

-- 2. Signup trigger must be idempotent
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;

-- 3. Admin snapshot: never explode on unexpected duplicates
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
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id LIMIT 1),
    'roles', COALESCE((
      SELECT jsonb_agg(r.role::text ORDER BY r.role) FROM public.user_roles r WHERE r.user_id = _user_id
    ), '[]'::jsonb),
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
      WHERE user_id = _user_id AND status IN ('captured','paid','success','completed')
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

-- 4. Deterministic role resolution: admin > teacher > student
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
             WHEN 'admin'::app_role THEN 0
             WHEN 'teacher'::app_role THEN 1
             ELSE 2
           END
  LIMIT 1
$function$;

-- 5. Admin user list: one row per person, highest role shown
CREATE OR REPLACE FUNCTION public.get_user_profiles_admin()
RETURNS TABLE(id uuid, full_name text, email text, mobile text, role text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.email, p.mobile,
         COALESCE(public.get_user_role(p.id)::text, 'student') AS role,
         p.created_at
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
$function$;