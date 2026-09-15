-- 1) TABLE
CREATE TABLE public.study_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id bigint NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  kind text NOT NULL,
  file_url text,
  external_url text,
  file_size integer,
  mime_type text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_materials TO authenticated;
GRANT ALL ON public.study_materials TO service_role;

-- 3) RLS
ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;

-- 4) POLICIES
CREATE POLICY "Enrolled students or staff can view study materials"
ON public.study_materials FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = auth.uid()
      AND e.course_id = study_materials.course_id
  )
);

CREATE POLICY "Staff can insert study materials"
ON public.study_materials FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')
);

CREATE POLICY "Staff can update study materials"
ON public.study_materials FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Staff can delete study materials"
ON public.study_materials FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- 5) INDEXES
CREATE INDEX study_materials_course_chapter_idx
  ON public.study_materials (course_id, chapter_id, sort_order);
CREATE INDEX study_materials_batchwide_idx
  ON public.study_materials (course_id) WHERE chapter_id IS NULL;

-- 6) VALIDATION TRIGGER (kind ↔ url consistency)
CREATE OR REPLACE FUNCTION public.validate_study_material_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind NOT IN ('pdf','doc','image','link') THEN
    RAISE EXCEPTION 'Invalid kind: %', NEW.kind;
  END IF;
  IF NEW.kind = 'link' THEN
    IF NEW.external_url IS NULL OR length(trim(NEW.external_url)) = 0 THEN
      RAISE EXCEPTION 'external_url required when kind = link';
    END IF;
  ELSE
    IF NEW.file_url IS NULL OR length(trim(NEW.file_url)) = 0 THEN
      RAISE EXCEPTION 'file_url required when kind != link';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_study_material_kind
BEFORE INSERT OR UPDATE ON public.study_materials
FOR EACH ROW EXECUTE FUNCTION public.validate_study_material_kind();

-- 7) updated_at trigger (reuse existing helper if present, else create)
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_study_materials_updated_at
BEFORE UPDATE ON public.study_materials
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 8) STORAGE OBJECT POLICIES (bucket itself created via storage_create_bucket tool)
CREATE POLICY "Staff can upload study material files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'study-materials'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

CREATE POLICY "Staff can update study material files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'study-materials'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

CREATE POLICY "Staff can delete study material files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'study-materials'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

CREATE POLICY "Enrolled students or staff can read study material files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'study-materials'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR EXISTS (
      SELECT 1
      FROM public.study_materials sm
      JOIN public.enrollments e
        ON e.course_id = sm.course_id AND e.user_id = auth.uid()
      WHERE sm.file_url IS NOT NULL
        AND position(name IN sm.file_url) > 0
    )
  )
);