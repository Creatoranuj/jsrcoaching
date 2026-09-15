-- 1. Fix students table: remove overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;

-- 2. Fix chat-attachments: restrict SELECT/INSERT to owner or staff
DROP POLICY IF EXISTS "Public read chat-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload chat-attachments" ON storage.objects;

CREATE POLICY "Auth read chat-attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    auth.uid()::text = split_part(name, '/', 1)
    OR auth.uid()::text = split_part(name, '/', 2)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

CREATE POLICY "Auth upload chat-attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (
    auth.uid()::text = split_part(name, '/', 1)
    OR auth.uid()::text = split_part(name, '/', 2)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);

-- 3. Helper: course-based storage access check (uses first path segment like course-123)
CREATE OR REPLACE FUNCTION public.can_access_storage_course(path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = (
      CASE
        WHEN split_part(path, '/', 1) LIKE 'course-%' THEN
          (split_part(split_part(path, '/', 1), '-', 2))::bigint
        ELSE NULL
      END
    )
    AND (
      c.price IS NULL OR c.price = 0
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'teacher'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.user_id = auth.uid()
          AND e.course_id = c.id
          AND e.status = 'active'
      )
    )
  );
$$;

-- 4. Fix course-materials and course-videos policies
DROP POLICY IF EXISTS "Auth read course-materials" ON storage.objects;
DROP POLICY IF EXISTS "Auth read course-videos" ON storage.objects;

CREATE POLICY "Auth read course-materials"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.can_access_storage_course(name)
  )
);

CREATE POLICY "Auth read course-videos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
    OR public.can_access_storage_course(name)
  )
);
