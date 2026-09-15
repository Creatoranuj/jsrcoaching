-- Finding #1: bind check_rate_limit to auth.uid() instead of trusting caller-supplied _user_id.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text, _user_id uuid, _max integer, _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _window_start timestamptz;
  _current_count integer;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  -- Ignore caller-supplied _user_id: always bind to authenticated caller.
  _user_id := _caller;

  _window_start := to_timestamp(
    (floor(extract(epoch from now())::bigint / _window_seconds) * _window_seconds)
  );

  INSERT INTO public.rate_limits (bucket, user_id, window_start, count)
  VALUES (_bucket, _user_id, _window_start, 1)
  ON CONFLICT (bucket, user_id, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _current_count;

  DELETE FROM public.rate_limits
   WHERE window_start < now() - (_window_seconds * 4 || ' seconds')::interval;

  RETURN _current_count <= _max;
END;
$$;

-- Finding #2: check_rate_limit_text is a server-side helper only.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, integer, integer)
  TO service_role;