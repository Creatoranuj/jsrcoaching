-- Study material must always belong to a course.
--
-- The `Enrolled users and staff can view materials` policy grants read access
-- by matching the row's course against the caller's active enrollment. A row
-- with course_id IS NULL matched no course — and an older duplicate policy
-- (dropped 2026-09-20) treated exactly that case as "visible to everyone signed
-- in". No such row has ever existed; this constraint makes sure none can.
ALTER TABLE public.materials ALTER COLUMN course_id SET NOT NULL;
