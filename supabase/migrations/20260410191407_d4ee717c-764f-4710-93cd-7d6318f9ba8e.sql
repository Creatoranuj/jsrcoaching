
-- ============================================================
-- FIX 1: Restrict doubt_sessions student UPDATE
-- ============================================================
DROP POLICY IF EXISTS "Students update own pending doubt sessions" ON public.doubt_sessions;
CREATE POLICY "Students update own pending doubt sessions"
  ON public.doubt_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = student_id AND status = 'pending')
  WITH CHECK (auth.uid() = student_id AND status = 'pending');

-- ============================================================
-- FIX 2: Tighten live_participants INSERT (require active session)
-- ============================================================
DROP POLICY IF EXISTS "Users manage own participation" ON public.live_participants;

-- Split the ALL policy into granular ones
CREATE POLICY "Users can join active sessions"
  ON public.live_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id AND ls.is_active = true
    )
  );

CREATE POLICY "Users can view own participation"
  ON public.live_participants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own participation"
  ON public.live_participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave sessions"
  ON public.live_participants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- FIX 3: Scope {public} role policies to {authenticated}
-- where they use auth.uid() or has_role()
-- ============================================================

-- books: admin manage
DROP POLICY IF EXISTS "Admins can manage books" ON public.books;
CREATE POLICY "Admins can manage books" ON public.books FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- chapters: admin/teacher manage
DROP POLICY IF EXISTS "Admins and teachers can manage chapters" ON public.chapters;
CREATE POLICY "Admins and teachers can manage chapters" ON public.chapters FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- chatbot_faq: admin manage
DROP POLICY IF EXISTS "Admins manage FAQs" ON public.chatbot_faq;
CREATE POLICY "Admins manage FAQs" ON public.chatbot_faq FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- chatbot_feedback: admin view + user view
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.chatbot_feedback;
CREATE POLICY "Admins can view all feedback" ON public.chatbot_feedback FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view own feedback" ON public.chatbot_feedback;
CREATE POLICY "Users can view own feedback" ON public.chatbot_feedback FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- chatbot_logs: admin view + user view
DROP POLICY IF EXISTS "Admins view all logs" ON public.chatbot_logs;
CREATE POLICY "Admins view all logs" ON public.chatbot_logs FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own logs" ON public.chatbot_logs;
CREATE POLICY "Users view own logs" ON public.chatbot_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- chatbot_settings: admin manage (public)
DROP POLICY IF EXISTS "Admins manage chatbot settings" ON public.chatbot_settings;
-- Already has authenticated version, just drop the public one

-- comments: all 4 policies
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
CREATE POLICY "Authenticated users can view comments" ON public.comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create own comments" ON public.comments;
CREATE POLICY "Users can create own comments" ON public.comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
CREATE POLICY "Users can update own comments" ON public.comments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users and admins can delete comments" ON public.comments;
CREATE POLICY "Users and admins can delete comments" ON public.comments FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- courses: admin manage
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;
CREATE POLICY "Admins can manage courses" ON public.courses FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- crawl_history
DROP POLICY IF EXISTS "Admins can manage crawl history" ON public.crawl_history;
CREATE POLICY "Admins can manage crawl history" ON public.crawl_history FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- doubt_sessions: student INSERT, student SELECT, admin already authenticated
DROP POLICY IF EXISTS "Students create doubt sessions" ON public.doubt_sessions;
CREATE POLICY "Students create doubt sessions" ON public.doubt_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students view own doubt sessions" ON public.doubt_sessions;
CREATE POLICY "Students view own doubt sessions" ON public.doubt_sessions FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

-- doubts
DROP POLICY IF EXISTS "Admins can manage all doubts" ON public.doubts;
CREATE POLICY "Admins can manage all doubts" ON public.doubts FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can create own doubts" ON public.doubts;
CREATE POLICY "Users can create own doubts" ON public.doubts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own doubts" ON public.doubts;
CREATE POLICY "Users can update own doubts" ON public.doubts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own doubts" ON public.doubts;
CREATE POLICY "Users can view own doubts" ON public.doubts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- enrollments: admin manage + user view + user insert
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;
CREATE POLICY "Admins can manage enrollments" ON public.enrollments FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;
CREATE POLICY "Users can view own enrollments" ON public.enrollments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- hero_banners: admin manage
DROP POLICY IF EXISTS "Admins can manage banners" ON public.hero_banners;
CREATE POLICY "Admins can manage banners" ON public.hero_banners FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- knowledge_base: admin manage
DROP POLICY IF EXISTS "Admins can manage knowledge base" ON public.knowledge_base;
CREATE POLICY "Admins can manage knowledge base" ON public.knowledge_base FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- landing_content: admin manage
DROP POLICY IF EXISTS "Admins can manage landing content" ON public.landing_content;
CREATE POLICY "Admins can manage landing content" ON public.landing_content FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- lecture_notes: all 4
DROP POLICY IF EXISTS "Users can create their own notes" ON public.lecture_notes;
CREATE POLICY "Users can create their own notes" ON public.lecture_notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own notes" ON public.lecture_notes;
CREATE POLICY "Users can view their own notes" ON public.lecture_notes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notes" ON public.lecture_notes;
CREATE POLICY "Users can update their own notes" ON public.lecture_notes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notes" ON public.lecture_notes;
CREATE POLICY "Users can delete their own notes" ON public.lecture_notes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- lecture_schedules
DROP POLICY IF EXISTS "Admins and teachers can manage schedules" ON public.lecture_schedules;
CREATE POLICY "Admins and teachers can manage schedules" ON public.lecture_schedules FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

DROP POLICY IF EXISTS "Authenticated users can view schedules" ON public.lecture_schedules;
CREATE POLICY "Authenticated users can view schedules" ON public.lecture_schedules FOR SELECT
  TO authenticated USING (true);

-- lesson_likes
DROP POLICY IF EXISTS "Anyone authenticated can view likes" ON public.lesson_likes;
CREATE POLICY "Anyone authenticated can view likes" ON public.lesson_likes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can like lessons" ON public.lesson_likes;
CREATE POLICY "Users can like lessons" ON public.lesson_likes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike lessons" ON public.lesson_likes;
CREATE POLICY "Users can unlike lessons" ON public.lesson_likes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- lessons
DROP POLICY IF EXISTS "Admins and teachers can manage lessons" ON public.lessons;
CREATE POLICY "Admins and teachers can manage lessons" ON public.lessons FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- live_messages
DROP POLICY IF EXISTS "Admins can update messages" ON public.live_messages;
CREATE POLICY "Admins can update messages" ON public.live_messages FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can insert own messages" ON public.live_messages;
CREATE POLICY "Authenticated users can insert own messages" ON public.live_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Teachers can update messages" ON public.live_messages;
CREATE POLICY "Teachers can update messages" ON public.live_messages FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'teacher'));

DROP POLICY IF EXISTS "Users can delete own messages" ON public.live_messages;
CREATE POLICY "Users can delete own messages" ON public.live_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- live_participants: admin/teacher policies
DROP POLICY IF EXISTS "Admins and teachers update participants" ON public.live_participants;
CREATE POLICY "Admins and teachers update participants" ON public.live_participants FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

DROP POLICY IF EXISTS "Admins and teachers view all participants" ON public.live_participants;
CREATE POLICY "Admins and teachers view all participants" ON public.live_participants FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- live_sessions: admin manage
DROP POLICY IF EXISTS "Admins can manage live sessions" ON public.live_sessions;
CREATE POLICY "Admins can manage live sessions" ON public.live_sessions FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can view live sessions" ON public.live_sessions;
CREATE POLICY "Authenticated users can view live sessions" ON public.live_sessions FOR SELECT
  TO authenticated USING (true);

-- materials
DROP POLICY IF EXISTS "Admins and teachers can manage materials" ON public.materials;
CREATE POLICY "Admins and teachers can manage materials" ON public.materials FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

DROP POLICY IF EXISTS "Authenticated users can view materials" ON public.materials;
CREATE POLICY "Authenticated users can view materials" ON public.materials FOR SELECT
  TO authenticated USING (true);

-- messages
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update their sent messages" ON public.messages;
CREATE POLICY "Users can update their sent messages" ON public.messages FOR UPDATE
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id);

-- notes
DROP POLICY IF EXISTS "Admins and teachers can manage notes" ON public.notes;
CREATE POLICY "Admins and teachers can manage notes" ON public.notes FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

DROP POLICY IF EXISTS "Authenticated users can view notes" ON public.notes;
CREATE POLICY "Authenticated users can view notes" ON public.notes FOR SELECT
  TO authenticated USING (true);

-- notices: admin/teacher manage
DROP POLICY IF EXISTS "Admins and teachers can manage notices" ON public.notices;
CREATE POLICY "Admins and teachers can manage notices" ON public.notices FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- payment_requests
DROP POLICY IF EXISTS "Admins can manage all payment requests" ON public.payment_requests;
CREATE POLICY "Admins can manage all payment requests" ON public.payment_requests FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can create own payment requests" ON public.payment_requests;
CREATE POLICY "Users can create own payment requests" ON public.payment_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

DROP POLICY IF EXISTS "Users can view own payment requests" ON public.payment_requests;
CREATE POLICY "Users can view own payment requests" ON public.payment_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- profiles: insert + update
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- questions
DROP POLICY IF EXISTS "Admins manage questions" ON public.questions;
CREATE POLICY "Admins manage questions" ON public.questions FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- leads: admin view
DROP POLICY IF EXISTS "Only admins can view leads" ON public.leads;
CREATE POLICY "Only admins can view leads" ON public.leads FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'));
