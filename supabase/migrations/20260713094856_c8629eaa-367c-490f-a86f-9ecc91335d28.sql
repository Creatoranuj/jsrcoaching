DROP POLICY IF EXISTS "Teachers can update messages" ON public.live_messages;
CREATE POLICY "Teachers can update messages"
ON public.live_messages
FOR UPDATE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = live_messages.session_id
      AND ls.created_by = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = live_messages.session_id
      AND ls.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
CREATE POLICY "Admins can manage site settings"
ON public.site_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));