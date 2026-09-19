-- push_notifications_log: sirf admin padh sakta hai (RLS policy already enforced).
-- anon role ko table par koi privilege nahi hona chahiye — ye migration sirf
-- extra grant hatati hai (cleanup). RLS pehle se hi anon reads rokta hai.
-- Table kuch environments me baad me banti hai, isliye conditional revoke.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'push_notifications_log'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.push_notifications_log FROM anon';
  END IF;
END $$;
