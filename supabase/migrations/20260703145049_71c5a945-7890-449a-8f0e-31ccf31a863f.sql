DROP POLICY IF EXISTS "Authenticated can read allowed channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can broadcast on allowed channels" ON realtime.messages;

CREATE POLICY "Authenticated can read allowed channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'live-session:%' AND EXISTS (
    SELECT 1 FROM public.live_participants lp
    WHERE lp.user_id = auth.uid()
      AND lp.session_id::text = split_part(realtime.topic(), ':', 2)
  ))
  OR (realtime.topic() LIKE 'live-session:%' AND EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id::text = split_part(realtime.topic(), ':', 2)
      AND (ls.created_by = auth.uid()
           OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  OR (realtime.topic() LIKE 'doubt-session:%' AND EXISTS (
    SELECT 1 FROM public.doubt_sessions ds
    WHERE ds.id::text = split_part(realtime.topic(), ':', 2)
      AND (ds.student_id = auth.uid() OR ds.teacher_id = auth.uid()
           OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
);

CREATE POLICY "Authenticated can broadcast on allowed channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() LIKE 'live-session:%' AND EXISTS (
    SELECT 1 FROM public.live_participants lp
    WHERE lp.user_id = auth.uid()
      AND lp.session_id::text = split_part(realtime.topic(), ':', 2)
  ))
  OR (realtime.topic() LIKE 'live-session:%' AND EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id::text = split_part(realtime.topic(), ':', 2)
      AND (ls.created_by = auth.uid()
           OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  OR (realtime.topic() LIKE 'doubt-session:%' AND EXISTS (
    SELECT 1 FROM public.doubt_sessions ds
    WHERE ds.id::text = split_part(realtime.topic(), ':', 2)
      AND (ds.student_id = auth.uid() OR ds.teacher_id = auth.uid()
           OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
);