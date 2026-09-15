
-- Tighten policy role scope from {public} to explicit auth roles.

-- live_messages: Teachers-can-update policy should target authenticated only.
DROP POLICY IF EXISTS "Teachers can update messages" ON public.live_messages;
CREATE POLICY "Teachers can update messages"
  ON public.live_messages
  FOR UPDATE
  TO authenticated
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

-- site_settings: public-read policy should target anon + authenticated explicitly.
DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;
CREATE POLICY "Anyone can view site settings"
  ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);
