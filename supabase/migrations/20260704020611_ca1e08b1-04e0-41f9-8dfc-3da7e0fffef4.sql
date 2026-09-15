-- community_posts: Admins update posts
DROP POLICY IF EXISTS "Admins update posts" ON public.community_posts;
CREATE POLICY "Admins update posts" ON public.community_posts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- funnel_entries: Admins can update funnel entries
DROP POLICY IF EXISTS "Admins can update funnel entries" ON public.funnel_entries;
CREATE POLICY "Admins can update funnel entries" ON public.funnel_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- live_messages: Admins can update messages
DROP POLICY IF EXISTS "Admins can update messages" ON public.live_messages;
CREATE POLICY "Admins can update messages" ON public.live_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- live_messages: Teachers can update messages
DROP POLICY IF EXISTS "Teachers can update messages" ON public.live_messages;
CREATE POLICY "Teachers can update messages" ON public.live_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));

-- live_participants: Admins and teachers update participants
DROP POLICY IF EXISTS "Admins and teachers update participants" ON public.live_participants;
CREATE POLICY "Admins and teachers update participants" ON public.live_participants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- user_sessions: Admins manage sessions
DROP POLICY IF EXISTS "Admins manage sessions" ON public.user_sessions;
CREATE POLICY "Admins manage sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));