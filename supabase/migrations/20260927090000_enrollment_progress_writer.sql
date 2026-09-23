-- Phase 2 (2026-09-23): the real writer for enrollments.progress_percentage /
-- enrollments.last_watched_lesson_id.
--
-- Background: the app only ever READ these two columns (My Courses, Reports,
-- Batch roster) but nothing wrote them — every lesson completion went to
-- public.user_progress and the enrollment stayed at 0 %. The writer was
-- applied to the live project on 2026-09-22 and 46 enrollments were
-- backfilled; this file makes the CI drift check and any fresh environment
-- converge on the same behaviour. Everything below is idempotent.
--
-- Rules (identical to get_my_courses_snapshot(), so the two never disagree):
--   total      = count(lessons where course_id = X)
--   completed  = count(distinct user_progress.lesson_id) joined to lessons in X
--                where completed IS TRUE
--   percentage = 0 when the course has no lessons, else least(100, round(100·done/total))
--   last lesson = the user's most recently watched lesson in X (last_watched_at)
--
-- Triggers:
--   • user_progress  AFTER INSERT/UPDATE/DELETE (row)  → recompute that user × course
--   • lessons        AFTER INSERT/DELETE/UPDATE OF course_id (row) → recompute the
--     whole course, because adding or removing a lesson changes every student's %.

-- ── Per-user recompute (hot path: one lesson completion) ───────────────────
CREATE OR REPLACE FUNCTION public.recompute_enrollment_progress(p_user_id uuid, p_course_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
  v_done  integer;
  v_pct   integer;
  v_last  uuid;
BEGIN
  IF p_user_id IS NULL OR p_course_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_total
    FROM public.lessons l
   WHERE l.course_id = p_course_id;

  SELECT count(DISTINCT p.lesson_id) INTO v_done
    FROM public.user_progress p
    JOIN public.lessons l ON l.id = p.lesson_id
   WHERE p.user_id = p_user_id
     AND p.completed IS TRUE
     AND l.course_id = p_course_id;

  v_pct := CASE
             WHEN coalesce(v_total, 0) <= 0 THEN 0
             ELSE least(100, round(100.0 * coalesce(v_done, 0) / v_total))::integer
           END;

  SELECT p.lesson_id INTO v_last
    FROM public.user_progress p
    JOIN public.lessons l ON l.id = p.lesson_id
   WHERE p.user_id = p_user_id
     AND l.course_id = p_course_id
   ORDER BY p.last_watched_at DESC NULLS LAST, p.created_at DESC NULLS LAST
   LIMIT 1;

  UPDATE public.enrollments e
     SET progress_percentage    = v_pct,
         last_watched_lesson_id = v_last
   WHERE e.user_id   = p_user_id
     AND e.course_id = p_course_id
     AND (e.progress_percentage    IS DISTINCT FROM v_pct
       OR e.last_watched_lesson_id IS DISTINCT FROM v_last);
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_enrollment_progress(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_enrollment_progress(uuid, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_enrollment_progress(uuid, bigint) TO service_role;

-- ── Per-course recompute (lesson added/removed, backfill) ──────────────────
CREATE OR REPLACE FUNCTION public.recompute_course_progress(p_course_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total   integer;
  v_updated integer;
BEGIN
  IF p_course_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_total
    FROM public.lessons l
   WHERE l.course_id = p_course_id;

  WITH done AS (
    SELECT p.user_id, count(DISTINCT p.lesson_id)::integer AS n
      FROM public.user_progress p
      JOIN public.lessons l ON l.id = p.lesson_id
     WHERE l.course_id = p_course_id
       AND p.completed IS TRUE
     GROUP BY p.user_id
  ),
  last_seen AS (
    SELECT DISTINCT ON (p.user_id) p.user_id, p.lesson_id
      FROM public.user_progress p
      JOIN public.lessons l ON l.id = p.lesson_id
     WHERE l.course_id = p_course_id
     ORDER BY p.user_id, p.last_watched_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  ),
  target AS (
    SELECT e.id,
           CASE
             WHEN coalesce(v_total, 0) <= 0 THEN 0
             ELSE least(100, round(100.0 * coalesce(d.n, 0) / v_total))::integer
           END AS pct,
           ls.lesson_id AS last_id
      FROM public.enrollments e
      LEFT JOIN done      d  ON d.user_id  = e.user_id
      LEFT JOIN last_seen ls ON ls.user_id = e.user_id
     WHERE e.course_id = p_course_id
  )
  UPDATE public.enrollments e
     SET progress_percentage    = t.pct,
         last_watched_lesson_id = t.last_id
    FROM target t
   WHERE t.id = e.id
     AND (e.progress_percentage    IS DISTINCT FROM t.pct
       OR e.last_watched_lesson_id IS DISTINCT FROM t.last_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_course_progress(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_course_progress(bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_course_progress(bigint) TO service_role;

-- ── Trigger: user_progress → enrollment ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_enrollment_progress_from_user_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_course bigint;
  v_new_course bigint;
BEGIN
  -- Resolve the course through the lesson (authoritative) and fall back to the
  -- denormalised user_progress.course_id for rows whose lesson was deleted.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT l.course_id INTO v_old_course FROM public.lessons l WHERE l.id = OLD.lesson_id;
    v_old_course := coalesce(v_old_course, OLD.course_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT l.course_id INTO v_new_course FROM public.lessons l WHERE l.id = NEW.lesson_id;
    v_new_course := coalesce(v_new_course, NEW.course_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_enrollment_progress(OLD.user_id, v_old_course);
    RETURN OLD;
  END IF;

  -- A row moved to another user/course (should never happen, but keep both
  -- sides consistent if it does).
  IF TG_OP = 'UPDATE'
     AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR v_old_course IS DISTINCT FROM v_new_course) THEN
    PERFORM public.recompute_enrollment_progress(OLD.user_id, v_old_course);
  END IF;

  PERFORM public.recompute_enrollment_progress(NEW.user_id, v_new_course);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_enrollment_progress_from_user_progress() FROM PUBLIC;

-- The writer was first installed on the live project by hand; converge on one
-- trigger regardless of the name it was given there.
DO $dedupe$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname, p.proname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'public.user_progress'::regclass
       AND NOT t.tgisinternal
       AND t.tgname <> 'trg_user_progress_sync_enrollment'
       AND p.prosrc ILIKE '%progress_percentage%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.user_progress', r.tgname);
    RAISE NOTICE 'dropped superseded progress trigger % (%)', r.tgname, r.proname;
  END LOOP;
END
$dedupe$;

DROP TRIGGER IF EXISTS trg_user_progress_sync_enrollment ON public.user_progress;
CREATE TRIGGER trg_user_progress_sync_enrollment
AFTER INSERT OR UPDATE OR DELETE ON public.user_progress
FOR EACH ROW EXECUTE FUNCTION public.sync_enrollment_progress_from_user_progress();

-- ── Trigger: lessons → every enrollment of the course ─────────────────────
CREATE OR REPLACE FUNCTION public.sync_course_progress_from_lessons()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.course_id IS NOT NULL THEN
    PERFORM public.recompute_course_progress(OLD.course_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.course_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.course_id IS DISTINCT FROM OLD.course_id) THEN
    PERFORM public.recompute_course_progress(NEW.course_id);
  END IF;
  RETURN NULL; -- AFTER trigger: return value ignored
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_course_progress_from_lessons() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_lessons_sync_course_progress ON public.lessons;
CREATE TRIGGER trg_lessons_sync_course_progress
AFTER INSERT OR DELETE OR UPDATE OF course_id ON public.lessons
FOR EACH ROW EXECUTE FUNCTION public.sync_course_progress_from_lessons();

-- ── Hot-path index: "did this user finish lessons of course X?" ───────────
CREATE INDEX IF NOT EXISTS idx_user_progress_user_lesson_completed
  ON public.user_progress (user_id, lesson_id)
  WHERE completed IS TRUE;

-- ── Backfill (no-op where already converged, e.g. the live project) ───────
SELECT public.recompute_course_progress(x.course_id)
  FROM (SELECT DISTINCT course_id FROM public.enrollments) x;
