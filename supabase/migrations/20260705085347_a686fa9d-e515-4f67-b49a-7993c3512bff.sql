
CREATE OR REPLACE FUNCTION public.check_rate_limit_text(
  _bucket text, _identifier text, _max integer, _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  -- Deterministic uuid v5-ish from bucket+identifier so different IPs get distinct rows.
  _uid := ('00000000-0000-0000-0000-' || substr(md5(_bucket || ':' || _identifier), 1, 12))::uuid;
  RETURN public.check_rate_limit(_bucket, _uid, _max, _window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit_text(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, integer, integer) TO service_role;
