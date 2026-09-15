
-- 1. funnel_stages / marketing_campaigns: drop broad teacher SELECT
DROP POLICY IF EXISTS "Teachers view funnel_stages" ON public.funnel_stages;
DROP POLICY IF EXISTS "Teachers view campaigns" ON public.marketing_campaigns;

-- 2. questions: remove teacher blanket SELECT. Teachers should use
-- public.get_quiz_questions() which already scopes to owned/enrolled quizzes.
DROP POLICY IF EXISTS "Only admins can select questions directly" ON public.questions;
CREATE POLICY "Only admins can select questions directly"
  ON public.questions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. leads: rate-limit inserts to 5 per hour per user to prevent spam.
CREATE OR REPLACE FUNCTION public.rate_limit_lead_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.check_rate_limit('leads_insert', auth.uid(), 5, 3600) THEN
    RAISE EXCEPTION 'Too many lead submissions, please try again later'
      USING ERRCODE = '42901';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rate_limit_lead_insert_trg ON public.leads;
CREATE TRIGGER rate_limit_lead_insert_trg
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_lead_insert();
