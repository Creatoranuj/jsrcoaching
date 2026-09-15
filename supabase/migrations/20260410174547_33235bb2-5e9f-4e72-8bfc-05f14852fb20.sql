
-- ============================================================
-- FIX #1: Lessons — enrollment-gated SELECT
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view lessons" ON public.lessons;

CREATE POLICY "Enrolled users and staff can view lessons"
ON public.lessons
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE enrollments.user_id = auth.uid()
      AND enrollments.course_id = lessons.course_id
      AND enrollments.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lessons.course_id
      AND (courses.price IS NULL OR courses.price = 0)
  )
);

-- ============================================================
-- FIX #2: Doubt sessions — restrict teacher access to assigned only
-- ============================================================
DROP POLICY IF EXISTS "Admins and teachers view all doubt sessions" ON public.doubt_sessions;
DROP POLICY IF EXISTS "Admins and teachers manage doubt sessions" ON public.doubt_sessions;

-- Admins retain full access
CREATE POLICY "Admins manage all doubt sessions"
ON public.doubt_sessions
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Teachers can only view sessions assigned to them
CREATE POLICY "Teachers view assigned doubt sessions"
ON public.doubt_sessions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND teacher_id = auth.uid()
);

-- Teachers can only update sessions assigned to them
CREATE POLICY "Teachers update assigned doubt sessions"
ON public.doubt_sessions
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND teacher_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND teacher_id = auth.uid()
);

-- ============================================================
-- FIX #3: Live messages — restrict to session participants
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view live messages" ON public.live_messages;

CREATE POLICY "Participants and staff can view live messages"
ON public.live_messages
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_participants.session_id = live_messages.session_id
      AND live_participants.user_id = auth.uid()
  )
);

-- ============================================================
-- FIX #4: Chatbot logs — remove anonymous insert loophole
-- ============================================================
DROP POLICY IF EXISTS "Users insert own logs" ON public.chatbot_logs;

CREATE POLICY "Authenticated users insert own logs"
ON public.chatbot_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Chatbot feedback — remove anonymous insert loophole
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chatbot_feedback;

CREATE POLICY "Authenticated users insert own feedback"
ON public.chatbot_feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
