DROP POLICY IF EXISTS "Authenticated users can insert replies" ON public.doubt_replies;

CREATE POLICY "Session participants can insert doubt replies"
ON public.doubt_replies
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.doubt_sessions ds
    WHERE ds.id = doubt_replies.doubt_session_id
      AND (
        ds.student_id = auth.uid()
        OR ds.teacher_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  )
);

DROP POLICY IF EXISTS "Authenticated users can insert own messages" ON public.live_messages;

CREATE POLICY "Participants and staff can insert live messages"
ON public.live_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.live_participants lp
      WHERE lp.session_id = live_messages.session_id
        AND lp.user_id = auth.uid()
    )
  )
);