
-- 1. Realtime: replace permissive ELSE true policies with explicit deny
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON realtime.messages', pol.policyname);
  END LOOP;
END $$;

-- Only allow realtime access to explicitly whitelisted channel prefixes for authenticated users
CREATE POLICY "Authenticated can read allowed channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'live-session:%')
  OR (realtime.topic() LIKE 'doubt-session:%' AND EXISTS (
        SELECT 1 FROM public.doubt_sessions ds
        WHERE ds.id::text = split_part(realtime.topic(), ':', 2)
          AND (ds.student_id = auth.uid() OR ds.teacher_id = auth.uid()
               OR public.has_role(auth.uid(), 'admin'::public.app_role))
      ))
);

CREATE POLICY "Authenticated can broadcast on allowed channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() LIKE 'live-session:%')
  OR (realtime.topic() LIKE 'doubt-session:%' AND EXISTS (
        SELECT 1 FROM public.doubt_sessions ds
        WHERE ds.id::text = split_part(realtime.topic(), ':', 2)
          AND (ds.student_id = auth.uid() OR ds.teacher_id = auth.uid()
               OR public.has_role(auth.uid(), 'admin'::public.app_role))
      ))
);

-- 2. comment-images: restrict uploads to user's own folder
DROP POLICY IF EXISTS "Users can upload comment images" ON storage.objects;
DROP POLICY IF EXISTS "comment-images insert" ON storage.objects;
DROP POLICY IF EXISTS "Comment images upload" ON storage.objects;

CREATE POLICY "Users upload to own comment-images folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comment-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own comment-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'comment-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own comment-images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'comment-images'
  AND (auth.uid()::text = (storage.foldername(name))[1]
       OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

-- 3. deletion_requests: allow users to submit their own request
CREATE POLICY "Users submit own deletion request"
ON public.deletion_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4. razorpay_payments: allow users to insert their own payment rows
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='razorpay_payments') THEN
    EXECUTE 'CREATE POLICY "Users insert own razorpay payments"
             ON public.razorpay_payments
             FOR INSERT TO authenticated
             WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;
