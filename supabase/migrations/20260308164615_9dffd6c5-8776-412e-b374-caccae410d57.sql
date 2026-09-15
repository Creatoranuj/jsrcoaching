-- Fix the security_definer view warning: recreate with security_invoker
DROP VIEW IF EXISTS public.questions_for_students;

CREATE VIEW public.questions_for_students
  WITH (security_invoker = true)
AS
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

GRANT SELECT ON public.questions_for_students TO authenticated;