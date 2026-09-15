
-- Account deletion requests (Apple/Google compliance)
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  notes text
);

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

-- Users may view only their own request (to show "pending" state in UI)
CREATE POLICY "Users view own deletion request"
ON public.deletion_requests
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admins can view and manage all requests
CREATE POLICY "Admins manage deletion requests"
ON public.deletion_requests
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- NOTE: No INSERT/UPDATE policy for end users.
-- All writes go through the `request-account-deletion` edge function,
-- which uses the service role (bypasses RLS) after validating the JWT.
