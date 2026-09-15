
DROP POLICY IF EXISTS "Anyone can view course videos"                ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read lecture-pdfs"                 ON storage.objects;
DROP POLICY IF EXISTS "Auth read course-materials"                   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "avatars public read"                          ON storage.objects;
DROP POLICY IF EXISTS "auth list course-videos"     ON storage.objects;
DROP POLICY IF EXISTS "auth list course-materials"  ON storage.objects;
DROP POLICY IF EXISTS "auth list lecture-pdfs"      ON storage.objects;
DROP POLICY IF EXISTS "auth list chat-attachments"  ON storage.objects;
DROP POLICY IF EXISTS "auth list content"           ON storage.objects;

CREATE POLICY "Admins list course-videos"    ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'course-videos'   AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins list course-materials" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'course-materials'AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins list lecture-pdfs"     ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lecture-pdfs'    AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins list content 2"        ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'content'         AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users read own chat attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Admins read all chat attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='chat-attachments' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users read own avatar"  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "trusted_hosts read all" ON public.trusted_hosts;
CREATE POLICY "trusted_hosts admin read"
  ON public.trusted_hosts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
REVOKE SELECT ON public.trusted_hosts FROM anon;

DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.error_logs;
REVOKE INSERT ON public.error_logs FROM anon;
CREATE POLICY "Authenticated users insert error logs"
  ON public.error_logs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND length(coalesce(message,'')) BETWEEN 1 AND 5000
    AND length(coalesce(stack_trace,'')) <= 20000
    AND length(coalesce(url,''))         <= 2000
    AND length(coalesce(user_agent,''))  <= 1000
  );

DROP POLICY IF EXISTS "Users insert own attempts"  ON public.quiz_attempts;
DROP POLICY IF EXISTS "Users update own attempts"  ON public.quiz_attempts;

CREATE POLICY "Users insert own attempts (no score)"
  ON public.quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND score IS NULL
    AND percentage IS NULL
    AND passed IS NULL
    AND submitted_at IS NULL
  );

CREATE POLICY "Users update own attempts (no score changes)"
  ON public.quiz_attempts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND submitted_at IS NULL)
  WITH CHECK (
    auth.uid() = user_id
    AND score IS NULL
    AND percentage IS NULL
    AND passed IS NULL
    AND submitted_at IS NULL
  );

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,uuid,integer,integer)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_text(text,text,integer,integer)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid,bigint,text,text)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_message_recipient_readonly()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_name_from_profile()                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_course_lesson_stats()                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_profiles_admin()                                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_submitted_quiz_attempt()                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_refund(text)                                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_lead_insert()                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sanitize_quiz_attempt_insert()                                  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_course_bundle(bigint)                                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_snapshot()                                        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid)                                        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid)                                             FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)                                        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(extensions.vector,double precision,integer)     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_lectures(text,integer)                                   FROM anon, PUBLIC;

GRANT  EXECUTE ON FUNCTION public.get_course_bundle(bigint)                                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_snapshot()                                        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_quiz_questions(uuid)                                        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid)                                             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role)                                        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.match_knowledge(extensions.vector,double precision,integer)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.search_lectures(text,integer)                                   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.complete_paid_enrollment(uuid,bigint,text,text)                 TO service_role;
GRANT  EXECUTE ON FUNCTION public.process_refund(text)                                            TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_user_profiles_admin()                                       TO service_role;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text,uuid,integer,integer)                     TO service_role;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit_text(text,text,integer,integer)                TO service_role;
