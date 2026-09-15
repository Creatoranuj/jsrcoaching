
-- Subscription plans catalog
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  period_days INTEGER NOT NULL CHECK (period_days > 0),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans"
  ON public.subscription_plans FOR SELECT
  USING (is_active = true);

-- Seed plans
INSERT INTO public.subscription_plans (slug, name, description, amount_paise, period_days, trial_days, sort_order) VALUES
  ('weekly',  'Weekly Premium',  'Full access, billed weekly',  14900,   7, 3, 1),
  ('monthly', 'Monthly Premium', 'Most popular — billed monthly', 39900,  30, 3, 2),
  ('yearly',  'Yearly Premium',  'Best value — billed yearly',   199900, 365, 3, 3);

-- User subscriptions
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_slug TEXT NOT NULL REFERENCES public.subscription_plans(slug),
  status TEXT NOT NULL CHECK (status IN ('trial','active','expired','cancelled')),
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  amount_paid_paise INTEGER,
  currency TEXT DEFAULT 'INR',
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies → only service role (edge functions) can write.

-- At most one live subscription per user
CREATE UNIQUE INDEX user_subscriptions_one_live_per_user
  ON public.user_subscriptions (user_id)
  WHERE status IN ('trial','active');

CREATE INDEX user_subscriptions_user_idx ON public.user_subscriptions (user_id);
CREATE INDEX user_subscriptions_status_idx ON public.user_subscriptions (status);

-- updated_at trigger (reuse existing function if present, else create)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
