
-- ============================================================
-- 1. user_roles: block privilege escalation
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Admins can assign roles to OTHER users only (never to themselves)
CREATE POLICY "Admins can insert roles for others"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND user_id <> auth.uid()
);

CREATE POLICY "Admins can update roles for others"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND user_id <> auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND user_id <> auth.uid()
);

CREATE POLICY "Admins can delete roles for others"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND user_id <> auth.uid()
);

-- Defense-in-depth trigger: even if a future policy is loose, block
-- self-elevation at the row level. Signup triggers run as SECURITY
-- DEFINER under postgres role, so auth.uid() is NULL there — allowed.
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.user_id = auth.uid()
     AND NEW.role IN ('admin', 'teacher')
  THEN
    RAISE EXCEPTION 'Self-assignment of % role is not permitted', NEW.role
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_role_escalation_trg ON public.user_roles;
CREATE TRIGGER prevent_self_role_escalation_trg
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

-- ============================================================
-- 2. Realtime broadcast lockdown for live_messages
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Live session participants can read broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Live session participants can send broadcasts" ON realtime.messages;

-- Topic format used by the app: 'live-session:<session_id>'
CREATE POLICY "Live session participants can read broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'live-session:%' THEN
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'teacher')
      OR EXISTS (
        SELECT 1 FROM public.live_participants lp
        WHERE lp.user_id = auth.uid()
          AND lp.session_id::text = substring(realtime.topic() FROM 'live-session:(.*)')
      )
    ELSE TRUE  -- other topics retain prior behavior
  END
);

CREATE POLICY "Live session participants can send broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() LIKE 'live-session:%' THEN
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'teacher')
      OR EXISTS (
        SELECT 1 FROM public.live_participants lp
        WHERE lp.user_id = auth.uid()
          AND lp.session_id::text = substring(realtime.topic() FROM 'live-session:(.*)')
      )
    ELSE TRUE
  END
);

-- ============================================================
-- 3. leads: bind to authenticated user
-- ============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id uuid;

DROP POLICY IF EXISTS "Authenticated users can submit leads" ON public.leads;

CREATE POLICY "Users can submit leads bound to themselves"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND student_name IS NOT NULL
  AND email IS NOT NULL
  AND grade IS NOT NULL
);

-- ============================================================
-- 4. chat-attachments storage: enforce per-user folder on upload
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;

CREATE POLICY "Users can upload chat attachments to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 5. course-videos storage: allow free-course access
-- ============================================================
CREATE POLICY "Free course videos viewable by authenticated users"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-videos'
  AND EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND (c.price IS NULL OR c.price = 0)
  )
);
