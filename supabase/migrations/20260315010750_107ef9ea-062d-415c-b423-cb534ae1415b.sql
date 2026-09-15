
-- Fix WARNING: Secure the questions_for_students view with security_invoker
-- Since it's a view, we recreate it with security_invoker=on
-- so it respects the caller's RLS on the base 'questions' table
DROP VIEW IF EXISTS public.questions_for_students;

CREATE VIEW public.questions_for_students
WITH (security_invoker=on) AS
  SELECT id, quiz_id, question_text, question_type, options, order_index, marks, negative_marks, image_url
  FROM public.questions;

-- Fix WARNING: Tighten leads INSERT policy (already dropped in prior migration)
DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;
CREATE POLICY "Anyone can submit leads"
  ON public.leads
  FOR INSERT
  TO public
  WITH CHECK (
    student_name IS NOT NULL AND email IS NOT NULL AND grade IS NOT NULL
  );
