CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket text NOT NULL,
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, user_id, window_start)
);

GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No client policies: only service_role (edge functions) touches this table.

CREATE INDEX IF NOT EXISTS rate_limits_window_idx
  ON public.rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text,
  _user_id uuid,
  _max integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start timestamptz;
  _current_count integer;
BEGIN
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

REVOKE ALL ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) TO service_role;