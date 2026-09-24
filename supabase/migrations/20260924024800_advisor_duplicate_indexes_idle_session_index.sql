-- Supabase Advisor 2026-09-24: duplicate indexes + hourly cron seq-scan (Disk IO budget)
-- Idempotent on purpose: Migration Drift Check replays this on top of supabase/schema-package.sql.

-- lecture_notes had THREE identical btree indexes on (lesson_id, user_id):
--   idx_lecture_notes_lesson_user        (plain index, 2026-01-29 migration)
--   lecture_notes_lesson_id_user_id_key  (UNIQUE constraint, baseline)  <- kept
--   lecture_notes_lesson_user_unique     (UNIQUE constraint, 2026-03-08 migration, redundant)
-- Any UNIQUE index on (lesson_id, user_id) keeps PostgREST upsert on_conflict=lesson_id,user_id working.
DROP INDEX IF EXISTS public.idx_lecture_notes_lesson_user;
ALTER TABLE public.lecture_notes DROP CONSTRAINT IF EXISTS lecture_notes_lesson_user_unique;

-- webhook_events had two identical indexes on (received_at DESC); keep the one the migrations declare.
DROP INDEX IF EXISTS public.webhook_events_received_at_idx;

-- Hourly pg_cron job deactivate_idle_user_sessions(72) filters
--   WHERE is_active = true AND last_active_at < now() - 72h
-- but the only partial index (idx_user_sessions_stale) covers is_active = FALSE,
-- so every tick seq-scanned the 1.1 MB heap (~165 shared blocks read per run).
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_last_active
  ON public.user_sessions USING btree (last_active_at)
  WHERE (is_active = true);

ANALYZE public.user_sessions;
ANALYZE public.lecture_notes;
ANALYZE public.webhook_events;