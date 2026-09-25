BEGIN;
DROP POLICY "Admins can view all testimonials" ON public.landing_testimonials;
DROP POLICY "Public can view active testimonials" ON public.landing_testimonials;
DROP POLICY "Admins can view all feedback" ON public.chatbot_feedback;
DROP POLICY "Users can view own feedback" ON public.chatbot_feedback;
DROP POLICY "Students update own pending doubt sessions" ON public.doubt_sessions;
DROP POLICY "Students view own doubt sessions" ON public.doubt_sessions;
DROP POLICY "Teachers update assigned doubt sessions" ON public.doubt_sessions;
DROP POLICY "Teachers view assigned doubt sessions" ON public.doubt_sessions;
DROP POLICY "Admins and teachers update participants" ON public.live_participants;
DROP POLICY "Admins and teachers view all participants" ON public.live_participants;
DROP POLICY "Users can update own participation" ON public.live_participants;
DROP POLICY "Users can view own participation" ON public.live_participants;
DROP POLICY "Admins view all attempts" ON public.quiz_attempts;
DROP POLICY "Users view own attempts" ON public.quiz_attempts;
DROP POLICY "Admins can view all notes" ON public.student_notes;
DROP POLICY "Users can view own notes" ON public.student_notes;
DROP POLICY "Admins can update messages" ON public.live_messages;
DROP POLICY "Teachers can update messages" ON public.live_messages;
DROP POLICY "Recipients can mark received messages as read" ON public.messages;
DROP POLICY "Senders can update their sent messages" ON public.messages;
DROP POLICY "Admins view all reads" ON public.notification_reads;
DROP POLICY "Users view own reads" ON public.notification_reads;
DROP POLICY "Admins and teachers can manage timetable" ON public.timetable;
DROP POLICY "Admins can manage timetable" ON public.timetable;
DROP POLICY "Admins can read all roles" ON public.user_roles;
DROP POLICY "Users can read own role" ON public.user_roles;
DROP POLICY "Admins can delete any session" ON public.user_sessions;
DROP POLICY "Admins view all sessions" ON public.user_sessions;
DROP POLICY "Users can delete own sessions" ON public.user_sessions;
DROP POLICY "Users view own sessions" ON public.user_sessions;
DROP POLICY "Admins can view all progress" ON public.user_progress;
DROP POLICY "Users can view own progress" ON public.user_progress;
DROP POLICY "Admins can view all site settings" ON public.site_settings;
DROP POLICY "Public can view public site settings" ON public.site_settings;
DROP POLICY hero_select_active_public ON public.hero;
DROP POLICY hero_select_all_admin ON public.hero;
DROP POLICY social_links_select_active_public ON public.social_links;
DROP POLICY social_links_select_all_admin ON public.social_links;
DROP POLICY "Admins view all logs" ON public.chatbot_logs;
DROP POLICY "Users view own logs" ON public.chatbot_logs;
DROP POLICY "Admins can view all landing courses" ON public.landing_courses;
DROP POLICY "Public can view active landing courses" ON public.landing_courses;

CREATE POLICY merged_select_user_sessions ON public.user_sessions FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR (select auth.uid()) = user_id);
CREATE POLICY merged_delete_user_sessions ON public.user_sessions FOR DELETE TO authenticated USING (has_role((select auth.uid()),'admin') OR user_id = (select auth.uid()));
CREATE POLICY merged_select_notification_reads ON public.notification_reads FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR (select auth.uid()) = user_id);
CREATE POLICY merged_select_user_roles ON public.user_roles FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR user_id = (select auth.uid()));
CREATE POLICY merged_select_chatbot_feedback ON public.chatbot_feedback FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR (select auth.uid()) = user_id);
CREATE POLICY merged_select_chatbot_logs ON public.chatbot_logs FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR (select auth.uid()) = user_id);
CREATE POLICY merged_select_quiz_attempts ON public.quiz_attempts FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR (select auth.uid()) = user_id);
CREATE POLICY merged_select_student_notes ON public.student_notes FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR (select auth.uid()) = user_id);
CREATE POLICY merged_select_user_progress ON public.user_progress FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR (select auth.uid()) = user_id);
CREATE POLICY merged_select_live_participants ON public.live_participants FOR SELECT TO authenticated USING (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'teacher') OR (select auth.uid()) = user_id);
CREATE POLICY merged_update_live_participants ON public.live_participants FOR UPDATE TO authenticated
  USING (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'teacher') OR (select auth.uid()) = user_id)
  WITH CHECK (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'teacher') OR (select auth.uid()) = user_id);
CREATE POLICY merged_update_live_messages ON public.live_messages FOR UPDATE TO authenticated
  USING (has_role((select auth.uid()),'admin') OR (has_role((select auth.uid()),'teacher') AND EXISTS (SELECT 1 FROM public.live_sessions ls WHERE ls.id = live_messages.session_id AND ls.created_by = (select auth.uid()))))
  WITH CHECK (has_role((select auth.uid()),'admin') OR (has_role((select auth.uid()),'teacher') AND EXISTS (SELECT 1 FROM public.live_sessions ls WHERE ls.id = live_messages.session_id AND ls.created_by = (select auth.uid()))));
CREATE POLICY merged_select_doubt_sessions ON public.doubt_sessions FOR SELECT TO authenticated USING ((select auth.uid()) = student_id OR (has_role((select auth.uid()),'teacher') AND teacher_id = (select auth.uid())));
CREATE POLICY merged_update_doubt_sessions ON public.doubt_sessions FOR UPDATE TO authenticated
  USING (((select auth.uid()) = student_id AND status = 'pending') OR (has_role((select auth.uid()),'teacher') AND teacher_id = (select auth.uid())))
  WITH CHECK (((select auth.uid()) = student_id AND status = 'pending') OR (has_role((select auth.uid()),'teacher') AND teacher_id = (select auth.uid())));
CREATE POLICY merged_update_messages ON public.messages FOR UPDATE TO authenticated
  USING ((select auth.uid()) = recipient_id OR (select auth.uid()) = sender_id)
  WITH CHECK ((select auth.uid()) = recipient_id OR (select auth.uid()) = sender_id);
CREATE POLICY merged_all_timetable ON public.timetable FOR ALL TO authenticated
  USING (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'teacher'))
  WITH CHECK (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'teacher'));
CREATE POLICY merged_select_landing_testimonials ON public.landing_testimonials FOR SELECT TO anon, authenticated USING (is_active = true OR has_role((select auth.uid()),'admin'));
CREATE POLICY merged_select_landing_courses ON public.landing_courses FOR SELECT TO anon, authenticated USING (is_active = true OR has_role((select auth.uid()),'admin'));
CREATE POLICY merged_select_hero ON public.hero FOR SELECT TO anon, authenticated USING (is_active = true OR has_role((select auth.uid()),'admin'));
CREATE POLICY merged_select_social_links ON public.social_links FOR SELECT TO anon, authenticated USING (is_active = true OR has_role((select auth.uid()),'admin'));
CREATE POLICY merged_select_site_settings ON public.site_settings FOR SELECT TO anon, authenticated USING (is_public IS TRUE OR has_role((select auth.uid()),'admin'));
COMMIT;