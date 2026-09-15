
-- ============================================================
-- SECURITY CRITICAL FIXES
-- ============================================================

-- CRITICAL FIX 1: Remove quiz correct-answer exposure
-- Any authenticated student could run:
--   supabase.from('questions').select('correct_answer')
-- and receive all answers. Removing this policy forces students
-- to use the questions_for_students VIEW which omits those columns.
-- Admins retain full access via "Admins manage questions".
DROP POLICY IF EXISTS "Authenticated read questions" ON public.questions;

-- CRITICAL FIX 2: Remove chatbot system-prompt exposure
-- Students could read system_prompt, model, temperature, etc. directly.
-- The chatbot Edge Function uses service_role so it never needs this policy.
-- Admins retain full access via "Admins manage chatbot settings".
DROP POLICY IF EXISTS "Authenticated users can read chatbot settings" ON public.chatbot_settings;

-- HIGH FIX 3: Allow students to update their own enrollment progress
-- Without this policy, progress_percentage and last_watched_lesson_id
-- silently fail to update when a student completes a video lesson.
CREATE POLICY "Users can update own enrollment progress"
ON public.enrollments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- HIGH FIX 4: Fix notices unauthenticated access
-- The old policy allowed unauthenticated callers when target_role IS NULL.
DROP POLICY IF EXISTS "Everyone can view notices" ON public.notices;

CREATE POLICY "Authenticated users can view notices"
ON public.notices FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    (target_role IS NULL)
    OR (target_role = get_user_role(auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- MEDIUM FIX 5: attendance RESTRICTIVE policy was blocking ALL access.
-- RESTRICTIVE policies AND-combine with PERMISSIVE ones; with no PERMISSIVE
-- policy present every query returned 0 rows. Re-create as PERMISSIVE.
DROP POLICY IF EXISTS "Admins and teachers can manage attendance" ON public.attendance;

CREATE POLICY "Admins and teachers can manage attendance"
ON public.attendance FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
);
