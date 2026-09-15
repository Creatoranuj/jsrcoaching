ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS device_type_check;
ALTER TABLE public.user_sessions
  ADD CONSTRAINT device_type_check
  CHECK (device_type = ANY (ARRAY['web','mobile','android','ios','desktop']));