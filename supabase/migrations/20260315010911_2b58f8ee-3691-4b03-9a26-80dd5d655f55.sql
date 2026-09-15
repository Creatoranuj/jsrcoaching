
-- FIX ERROR: Remove overly broad profiles SELECT policy exposing PII
DROP POLICY "Authenticated users can read any profile public info" ON public.profiles;

-- FIX WARNING: Recreate questions_for_students view with security_invoker
DROP VIEW IF EXISTS public.questions_for_students;
CREATE VIEW public.questions_for_students
WITH (security_invoker = on) AS
  SELECT id, quiz_id, question_text, question_type, options, order_index, marks, negative_marks, image_url
  FROM public.questions;
