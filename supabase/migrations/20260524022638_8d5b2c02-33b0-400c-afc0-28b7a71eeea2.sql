
-- 1. Notification reads table
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notice_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notice_id)
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reads"
ON public.notification_reads FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own reads"
ON public.notification_reads FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own reads"
ON public.notification_reads FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all reads"
ON public.notification_reads FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS notification_reads_user_idx ON public.notification_reads(user_id);

-- 2. Teacher details on courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS teacher_name text,
  ADD COLUMN IF NOT EXISTS teacher_title text,
  ADD COLUMN IF NOT EXISTS teacher_bio text,
  ADD COLUMN IF NOT EXISTS teacher_avatar_url text,
  ADD COLUMN IF NOT EXISTS teacher_verified boolean NOT NULL DEFAULT false;
