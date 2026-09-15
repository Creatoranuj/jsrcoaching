-- Fix: check_rate_limit raised 'authentication required' when invoked with the
-- service-role client (auth.uid() IS NULL), which made every payment edge
-- function fail-closed with 503 rate_limiter_unavailable.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text,
  _user_id uuid,
  _max integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _subject uuid;
  _window_start timestamptz;
  _current_count integer;
BEGIN
  -- Signed-in callers are always bound to their own uid (no spoofing).
  -- Service-role / no-session callers (edge functions) supply the subject.
  _subject := COALESCE(_caller, _user_id);
  IF _subject IS NULL THEN
    RAISE EXCEPTION 'rate limit subject required' USING ERRCODE = '22023';
  END IF;

  IF _window_seconds IS NULL OR _window_seconds <= 0 THEN
    _window_seconds := 60;
  END IF;

  _window_start := to_timestamp(
    (floor(extract(epoch from now())::bigint / _window_seconds) * _window_seconds)
  );

  INSERT INTO public.rate_limits (bucket, user_id, window_start, count)
  VALUES (_bucket, _subject, _window_start, 1)
  ON CONFLICT (bucket, user_id, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _current_count;

  DELETE FROM public.rate_limits
   WHERE window_start < now() - (_window_seconds * 4 || ' seconds')::interval;

  RETURN _current_count <= _max;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit_text(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, integer, integer) TO service_role;

-- Short-name aliases: several deployed edge functions call public.n / public.n_text.
CREATE OR REPLACE FUNCTION public.n(
  _bucket text,
  _user_id uuid,
  _max integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.check_rate_limit(_bucket, _user_id, _max, _window_seconds);
$function$;

REVOKE ALL ON FUNCTION public.n(text, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.n(text, uuid, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.n_text(
  _bucket text,
  _identifier text,
  _max integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.check_rate_limit_text(_bucket, _identifier, _max, _window_seconds);
$function$;

REVOKE ALL ON FUNCTION public.n_text(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.n_text(text, text, integer, integer) TO service_role;