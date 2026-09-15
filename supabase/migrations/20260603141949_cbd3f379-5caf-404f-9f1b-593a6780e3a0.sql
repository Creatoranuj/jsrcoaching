
CREATE OR REPLACE FUNCTION public.audit_security_policies()
RETURNS TABLE(issue text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  -- 1. realtime.messages: any policy whose USING or WITH CHECK is just "true"
  SELECT 'realtime_open_policy'::text,
         format('policy %s on realtime.messages is unrestricted', policyname)
  FROM pg_policies
  WHERE schemaname = 'realtime'
    AND tablename  = 'messages'
    AND (
      btrim(coalesce(qual,''))       IN ('true','(true)')
      OR btrim(coalesce(with_check,'')) IN ('true','(true)')
    )

  UNION ALL

  -- 2. realtime.messages: must have at least one policy referencing realtime.topic()
  SELECT 'realtime_missing_topic_filter'::text,
         'no realtime.messages policy references realtime.topic() — channels are unrestricted'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='realtime' AND tablename='messages'
      AND (coalesce(qual,'') ILIKE '%realtime.topic()%'
           OR coalesce(with_check,'') ILIKE '%realtime.topic()%')
  )

  UNION ALL

  -- 3. storage.objects INSERT policies on comment-images must check storage.foldername
  SELECT 'storage_comment_images_open_upload'::text,
         format('policy %s allows comment-images upload without folder check', policyname)
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND cmd IN ('INSERT','UPDATE','ALL')
    AND coalesce(with_check,'') ILIKE '%comment-images%'
    AND coalesce(with_check,'') NOT ILIKE '%foldername%'

  UNION ALL

  -- 4. comment-images must have at least one INSERT policy that checks foldername
  SELECT 'storage_comment_images_missing_folder_policy'::text,
         'no INSERT policy on storage.objects ties comment-images uploads to a user folder'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND cmd IN ('INSERT','ALL')
      AND coalesce(with_check,'') ILIKE '%comment-images%'
      AND coalesce(with_check,'') ILIKE '%foldername%'
  );
$$;

REVOKE ALL ON FUNCTION public.audit_security_policies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_security_policies() TO service_role;
