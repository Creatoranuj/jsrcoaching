-- =====================================================
-- SECURITY FIX 1: Block privilege escalation on user_roles
-- Only admins can INSERT new role rows
-- =====================================================
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- SECURITY FIX 2: Chatbot settings — restrict to authenticated users only
-- =====================================================
DROP POLICY IF EXISTS "Anyone can read chatbot settings" ON public.chatbot_settings;
CREATE POLICY "Authenticated users can read chatbot settings"
  ON public.chatbot_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =====================================================
-- SECURITY FIX 3: Timetable — restrict to authenticated users (stop leaking teacher UUIDs)
-- =====================================================
DROP POLICY IF EXISTS "Everyone can view timetable" ON public.timetable;
CREATE POLICY "Authenticated users can view timetable"
  ON public.timetable
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =====================================================
-- SECURITY FIX 4: Quiz questions_for_students view
-- Excludes correct_answer & explanation so students can't cheat
-- =====================================================
CREATE OR REPLACE VIEW public.questions_for_students AS
  SELECT
    id,
    quiz_id,
    question_text,
    question_type,
    options,
    marks,
    negative_marks,
    order_index,
    image_url
  FROM public.questions;

-- Grant authenticated users access to this safe view
GRANT SELECT ON public.questions_for_students TO authenticated;