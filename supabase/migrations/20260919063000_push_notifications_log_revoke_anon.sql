-- push_notifications_log: sirf admin padh sakta hai (RLS policy already enforced).
-- anon role ko table par koi privilege nahi hona chahiye — ye migration sirf
-- extra grant hatati hai (cleanup). RLS pehle se hi anon reads rokta hai.
REVOKE ALL ON public.push_notifications_log FROM anon;
