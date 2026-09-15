
CREATE OR REPLACE FUNCTION public.audit_security_policies()
RETURNS TABLE(issue text, detail text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT 'realtime_open_policy'::text,
         format('policy %s on realtime.messages is unrestricted', policyname)
  FROM pg_policies
  WHERE schemaname='realtime' AND tablename='messages'
    AND (btrim(coalesce(qual,'')) IN ('true','(true)')
      OR btrim(coalesce(with_check,'')) IN ('true','(true)'))
  UNION ALL
  SELECT 'realtime_missing_topic_filter'::text,
         'no realtime.messages policy references realtime.topic()'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='realtime' AND tablename='messages'
      AND (coalesce(qual,'') ILIKE '%realtime.topic()%'
        OR coalesce(with_check,'') ILIKE '%realtime.topic()%'))
  UNION ALL
  SELECT 'storage_comment_images_open_upload'::text,
         format('policy %s allows comment-images upload without folder check', policyname)
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND cmd IN ('INSERT','UPDATE','ALL')
    AND coalesce(with_check,'') ILIKE '%comment-images%'
    AND coalesce(with_check,'') NOT ILIKE '%foldername%'
  UNION ALL
  SELECT 'storage_comment_images_missing_folder_policy'::text,
         'no INSERT policy ties comment-images uploads to a user folder'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND cmd IN ('INSERT','ALL')
      AND coalesce(with_check,'') ILIKE '%comment-images%'
      AND coalesce(with_check,'') ILIKE '%foldername%');
$$;

GRANT EXECUTE ON FUNCTION public.audit_security_policies() TO anon, authenticated, service_role;
