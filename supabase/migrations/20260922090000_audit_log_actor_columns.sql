-- audit_log: add actor/entity columns used by admin RPC functions.
--
-- The table was created with (user_id, action, table_name, record_count,
-- metadata), but the admin_* RPCs (admin_set_user_block, admin_hide_content,
-- ...) INSERT with (actor_id, action, entity_type, entity_id, metadata).
-- Without these columns every admin audit write raised
-- "column \"actor_id\" of relation \"audit_log\" does not exist" and the
-- admin action failed. Additive only — no existing rows or policies touched.

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

COMMENT ON COLUMN public.audit_log.actor_id IS 'Admin user who performed the action (auth.uid() at call time).';
COMMENT ON COLUMN public.audit_log.entity_type IS 'Domain of the target row, e.g. profile, course, lecture.';
COMMENT ON COLUMN public.audit_log.entity_id IS 'Primary key of the row the action targeted.';
