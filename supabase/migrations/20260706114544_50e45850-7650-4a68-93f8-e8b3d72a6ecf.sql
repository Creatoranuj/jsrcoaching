-- ============================================================
-- 1) lecture_schedules — restrict SELECT by enrollment
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view schedules" ON public.lecture_schedules;

CREATE POLICY "Enrolled users and staff can view schedules"
  ON public.lecture_schedules FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.course_id = lecture_schedules.course_id
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = lecture_schedules.course_id
        AND (c.price IS NULL OR c.price = 0)
    )
  );

-- ============================================================
-- 2) live_sessions — restrict SELECT by enrollment
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view live sessions" ON public.live_sessions;

CREATE POLICY "Enrolled users and staff can view live sessions"
  ON public.live_sessions FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR (
      course_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.user_id = auth.uid()
          AND e.course_id = live_sessions.course_id
          AND e.status = 'active'
      )
    )
    OR (
      course_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = live_sessions.course_id
          AND (c.price IS NULL OR c.price = 0)
      )
    )
  );

-- ============================================================
-- 3) notes — restrict SELECT via lessons → course enrollment
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view notes" ON public.notes;

CREATE POLICY "Enrolled users and staff can view notes"
  ON public.notes FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.enrollments e
        ON e.course_id = l.course_id
       AND e.user_id = auth.uid()
       AND e.status = 'active'
      WHERE l.id = notes.lesson_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = notes.lesson_id
        AND (c.price IS NULL OR c.price = 0)
    )
  );

-- ============================================================
-- 4) quizzes — restrict SELECT by enrollment
-- ============================================================
DROP POLICY IF EXISTS "Students view published quizzes" ON public.quizzes;

CREATE POLICY "Enrolled students view published quizzes"
  ON public.quizzes FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR created_by = auth.uid()
    OR (
      is_published = true AND (
        (course_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.user_id = auth.uid()
            AND e.course_id = quizzes.course_id
            AND e.status = 'active'
        ))
        OR (course_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.courses c
          WHERE c.id = quizzes.course_id
            AND (c.price IS NULL OR c.price = 0)
        ))
      )
    )
  );

-- ============================================================
-- 5) messages — recipients can only flip is_read (enforced by trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_message_recipient_readonly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins bypass
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- If the caller is the recipient but NOT the sender, they may only change is_read.
  IF auth.uid() = OLD.recipient_id AND auth.uid() IS DISTINCT FROM OLD.sender_id THEN
    IF NEW.sender_id      IS DISTINCT FROM OLD.sender_id
    OR NEW.recipient_id   IS DISTINCT FROM OLD.recipient_id
    OR NEW.subject        IS DISTINCT FROM OLD.subject
    OR NEW.content        IS DISTINCT FROM OLD.content
    OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
    OR NEW.attachment_type IS DISTINCT FROM OLD.attachment_type
    OR NEW.created_at     IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Recipients may only mark messages as read'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_message_recipient_readonly_trg ON public.messages;
CREATE TRIGGER enforce_message_recipient_readonly_trg
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_recipient_readonly();

-- ============================================================
-- 6) site_settings — authenticated non-admins only see public rows
-- ============================================================
DROP POLICY IF EXISTS "Authenticated reads all site settings" ON public.site_settings;

CREATE POLICY "Authenticated reads public or all-if-admin"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (
    is_public = true
    OR has_role(auth.uid(), 'admin'::app_role)
  );