
-- =============================================
-- 1. Restrict policies from {public} to {authenticated}
-- =============================================

-- quiz_attempts
DROP POLICY IF EXISTS "Admins view all attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Users insert own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Users update own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Users view own attempts" ON public.quiz_attempts;

CREATE POLICY "Admins view all attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own attempts" ON public.quiz_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own attempts" ON public.quiz_attempts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users view own attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- quizzes
DROP POLICY IF EXISTS "Admins manage quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Students view published quizzes" ON public.quizzes;

CREATE POLICY "Admins manage quizzes" ON public.quizzes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students view published quizzes" ON public.quizzes
  FOR SELECT TO authenticated USING (is_published = true);

-- user_progress
DROP POLICY IF EXISTS "Admins can view all progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can view own progress" ON public.user_progress;

CREATE POLICY "Admins can view all progress" ON public.user_progress
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own progress" ON public.user_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.user_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own progress" ON public.user_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- razorpay_payments
DROP POLICY IF EXISTS "Admins can manage all razorpay payments" ON public.razorpay_payments;
DROP POLICY IF EXISTS "Users can view own razorpay payments" ON public.razorpay_payments;

CREATE POLICY "Admins can manage all razorpay payments" ON public.razorpay_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own razorpay payments" ON public.razorpay_payments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- syllabus
DROP POLICY IF EXISTS "Admins and teachers can manage syllabus" ON public.syllabus;
DROP POLICY IF EXISTS "Authenticated users can view syllabus" ON public.syllabus;

CREATE POLICY "Admins and teachers can manage syllabus" ON public.syllabus
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- timetable
DROP POLICY IF EXISTS "Admins and teachers can manage timetable" ON public.timetable;
DROP POLICY IF EXISTS "Authenticated users can view timetable" ON public.timetable;

CREATE POLICY "Admins and teachers can manage timetable" ON public.timetable
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- user_roles (drop {public} duplicates; keep {authenticated} ones)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- =============================================
-- 2. Storage: chat-attachments recipient SELECT
-- =============================================

DROP POLICY IF EXISTS "Recipients can view chat attachments" ON storage.objects;
CREATE POLICY "Recipients can view chat attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.recipient_id = auth.uid()
      AND m.attachment_url LIKE '%' || storage.objects.name
  )
);
