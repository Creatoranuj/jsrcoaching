# Security Fix Pack — 2026-07-30

Target project: **`xvlvrbpqxqqqaeihofod`** (your own Supabase account).

Lovable's built-in migration tool is still bound to a different (empty) managed
backend, so these must be run manually: **Supabase → SQL Editor → New query →
paste → Run**. Everything below is idempotent — safe to re-run.

Client code already uses `createSignedUrl` for chat attachments
(`src/pages/Messages.tsx`, `src/components/chat/ChatWidget.tsx`), so no frontend
change is needed after making the buckets private.

---

## 1. Storage buckets: chat-attachments + paid content (findings `chat_attachments_public_read`, `course_videos_materials_any_authenticated_read`)

```sql
-- Make sensitive buckets private
UPDATE storage.buckets
SET public = false
WHERE id IN ('chat-attachments','receipts','content','course-videos','course-materials','student-notes','lesson-attachments','notices');

-- Drop any blanket-access object policies
DROP POLICY IF EXISTS "Public read chat attachments"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read course videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read materials"     ON storage.objects;

-- chat-attachments: only the uploader (path prefix = their uid) or an admin
CREATE POLICY "chat_attachments_owner_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "chat_attachments_owner_write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Paid content: enrolled students, teachers, admins only
CREATE POLICY "paid_content_enrolled_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('course-videos','course-materials','lesson-attachments')
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.status = 'active'
    )
  )
);
```

## 2. `students` table over-exposure (finding `students_table_broad_authenticated_access`)

```sql
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='students'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.students', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.students FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;

CREATE POLICY "students_self_read" ON public.students
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));

CREATE POLICY "students_self_update" ON public.students
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "students_admin_write" ON public.students
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
```

## 3. `lesson_ratings` open read (finding `lesson_ratings_open_read`)

```sql
ALTER TABLE public.lesson_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_ratings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_ratings TO authenticated;
GRANT ALL ON public.lesson_ratings TO service_role;

DROP POLICY IF EXISTS "Anyone can read lesson ratings" ON public.lesson_ratings;
DROP POLICY IF EXISTS "lesson_ratings_select" ON public.lesson_ratings;

CREATE POLICY "lesson_ratings_own_or_staff_read" ON public.lesson_ratings
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));

CREATE POLICY "lesson_ratings_own_write" ON public.lesson_ratings
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "lesson_ratings_own_update" ON public.lesson_ratings
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

If the app shows an aggregate rating publicly, expose it through a
`SECURITY DEFINER` function that returns only `avg`/`count` — never rows.

## 4. Always-true RLS policies (finding `SUPA_rls_policy_always_true`)

First list the offenders:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual IN ('true','(true)') OR with_check IN ('true','(true)'));
```

Every row that comes back must be replaced with an `auth.uid()`- or
`has_role()`-scoped predicate. Only genuinely public catalogue tables
(e.g. published courses/books listing) may keep `USING (true)`, and those
should be `TO anon, authenticated` with `SELECT` only.

## 5. SECURITY DEFINER EXECUTE grants (findings `SUPA_anon_…` / `SUPA_authenticated_security_definer_function_executable`)

Run the whitelist sweep from `docs/SECURITY-FIX-2026-07-06-definer-grants.md`
(unchanged, still correct), then verify:

```bash
bunx vitest run src/test/definer-grants.integration.test.ts
```

## 6. pg_graphql table exposure (findings `SUPA_pg_graphql_anon_table_exposed`, `SUPA_pg_graphql_authenticated_table_exposed`)

The GraphQL endpoint mirrors table grants. Disable it if unused (the app only
uses PostgREST + RPC):

```sql
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
```

If you prefer to keep GraphQL, the fixes in §1–§4 already remove the
underlying table grants that were being exposed.

## 7. Leaked password protection (finding `SUPA_auth_leaked_password_protection`)

Dashboard only — **Authentication → Providers → Email → enable
“Password HIBP Check”**. No SQL.

---

## Verification after running

```sql
-- no anon-readable sensitive tables
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public' ORDER BY 1;

-- no always-true policies left
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND (qual IN ('true','(true)') OR with_check IN ('true','(true)'));

-- buckets private
SELECT id, public FROM storage.buckets ORDER BY 1;
```

Then in the app: log out and confirm chat attachments, course videos and the
student roster all fail to load for an anonymous session.
