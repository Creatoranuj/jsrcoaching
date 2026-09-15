# Red-Team Audit — SECURITY DEFINER functions

**Date:** 2026-07-22
**Scope:** All 42 `SECURITY DEFINER` functions in schema `public`.
**Rating: 4.5 / 5** — Prior hardening (2026-07-21) is holding. No CRITICAL/HIGH findings. Two MEDIUM + one LOW documented below with migration-ready SQL. Admin UI is not affected.

## Snapshot method

- `pg_proc` × `pg_namespace` × `pg_roles` join for every `prosecdef=true` in `public`.
- Function bodies pulled with `pg_get_functiondef` for authz-check spot-verification.
- Cross-referenced against `references/functions-catalog.md` and `rg` of `src/**` for real callers.

## Coverage matrix

| Class | Count | EXECUTE grantees observed | Verdict |
| --- | --- | --- | --- |
| Trigger-only (`handle_new_user*`, `enforce_*`, `prevent_*`, `sanitize_*`, `stamp_*`, `validate_*`, `audit_leads_access`, `update_lesson_like_count`, `rate_limit_lead_insert`, `lock_submitted_quiz_attempt`, `purge_expired_phone_otps`) | 15 | `postgres`, `service_role` only | PASS — correctly hidden from clients. |
| Admin-only (`admin_*`, `get_user_profiles_admin`) | 8 | `postgres`, `service_role`, `authenticated` | PASS — every body starts with `IF NOT public.has_role(auth.uid(),'admin') THEN RAISE 42501`. `search_path` pinned to `public`. |
| Auth-scoped self (`get_dashboard_snapshot`, `get_course_bundle`, `get_quiz_questions`, `get_quiz_review`, `verify_enrollment_for_attendance`, `has_role`, `get_user_role`, `match_knowledge`) | 8 | `postgres`, `service_role`, `authenticated` | PASS — bodies scope via `auth.uid()` and enrollment/ownership checks; sensitive columns gated by `_is_priv`. |
| Public read (`get_platform_stats`, `search_lectures`) | 2 | `+ anon` | ACCEPTED — landing counts + public lecture search, no PII exposed. |
| Edge-function only (`complete_paid_enrollment`, `process_refund`, `is_user_blocked`, `user_can_access_live_session_topic`) | 4 | `postgres`, `service_role` only | PASS — reachable only from server-side code. |
| Utility, caller-arg trusted (`check_rate_limit`, `check_rate_limit_text`) | 2 | `+ authenticated` | MEDIUM — see finding #1. |
| Aggregate (no authz) (`get_course_lesson_stats`) | 1 | `+ authenticated` | LOW — see finding #3. |
| `handle_new_user`, `handle_new_user_role`, `assign_admin_on_signup` | 3 | trigger-only | PASS. |

All 42 functions have `SET search_path = public` (or `public, extensions` for `search_lectures`). No search-path hijack surface.

## Attack probes run

1. **Trigger-only fns reachable from clients?** `SELECT public.handle_new_user()` as `authenticated` → `permission denied` (ACL is postgres+service_role only). ✔
2. **Admin fns callable as non-admin?** `SELECT public.admin_set_user_block(...)` as regular authenticated user → raises `42501 admin only` from internal `has_role` check. ✔
3. **search_path hijack?** All configs pinned to `public` — a malicious per-session `search_path = evil, public` cannot redirect table lookups. ✔
4. **Owner check?** Every function owned by `postgres` — no compromise via a less-privileged owner. ✔
5. **`get_course_bundle` leaking paid content?** Non-enrolled request → `video_url / class_pdf_url / transcript_md` return `NULL`. ✔
6. **`get_platform_stats` as anon** → returns three integers only, no PII. ✔

## Findings

### [MEDIUM] [AUTHZ] `check_rate_limit(_user_id)` trusts caller-supplied identity

**Where:** `public.check_rate_limit(_bucket text, _user_id uuid, _max int, _window_seconds int)`

**Evidence:** function accepts `_user_id` as an argument and inserts into `public.rate_limits` using that value verbatim; no `auth.uid()` compare. Grant to `authenticated`.

**Attack:**
- **Self-bypass:** attacker sends a random `_user_id` on every request → their real-user bucket never fills → rate limit defeated for e.g. OTP resend, doubt spam, chatbot flood.
- **Denial-of-service against another user:** attacker calls it with victim's `uuid` and `_max=1`, victim's next legitimate call is throttled.

**Fix (SQL, migration-ready):**

```sql
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text, _user_id uuid, _max int, _window_seconds int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _window_start timestamptz;
  _current_count int;
BEGIN
  -- Ignore caller-supplied _user_id: always bind to the authenticated caller.
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  _user_id := _caller;

  _window_start := to_timestamp(
    (floor(extract(epoch from now())::bigint / _window_seconds) * _window_seconds)
  );
  INSERT INTO public.rate_limits (bucket, user_id, window_start, count)
  VALUES (_bucket, _user_id, _window_start, 1)
  ON CONFLICT (bucket, user_id, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _current_count;

  DELETE FROM public.rate_limits
   WHERE window_start < now() - (_window_seconds * 4 || ' seconds')::interval;

  RETURN _current_count <= _max;
END;
$$;
```

**Admin-UI impact:** none — grep confirms no admin page passes a non-self `_user_id`; edge functions that need to rate-limit by an arbitrary key already use `check_rate_limit_text` (see finding #2).

**Regression guard:** add Playwright probe that logs in as user A, calls the RPC with user B's uuid, and asserts A's bucket increments (not B's).

### [MEDIUM] [AUTHZ] `check_rate_limit_text(_identifier)` grantable to any authenticated user

**Where:** `public.check_rate_limit_text(_bucket text, _identifier text, _max int, _window_seconds int)`

**Evidence:** derives a synthetic uuid from `md5(_bucket || ':' || _identifier)` and delegates to `check_rate_limit`. `authenticated` has EXECUTE.

**Attack:** used server-side to throttle by IP / phone / email. If any authenticated client can call it directly, they can exhaust or lock any known identifier bucket (e.g. OTP resend for a target phone number).

**Fix (SQL):**

```sql
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_text(text, text, int, int)
  TO service_role;
```

**Admin-UI impact:** none — this function is only called from edge functions (`send-otp`, `verify-otp`, webhook handlers). Client callers use plain query-key limits.

**Regression guard:** `rg` in CI for `check_rate_limit_text` under `src/` — must return zero hits.

### [LOW] [DATA] `get_course_lesson_stats()` un-authz'd aggregate

**Where:** `public.get_course_lesson_stats()` — no `auth.uid()` check, returns `(course_id, lesson_count, total_duration)` for every course.

**Why it matters:** low sensitivity (already implied by public course catalog), but the RPC is broader than needed and is one of the top offenders in slow-query logs. Consider a materialized view refreshed hourly.

**Fix (SQL, optional):**

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_course_lesson_stats AS
SELECT course_id,
       COUNT(*)::bigint AS lesson_count,
       COALESCE(SUM(duration), 0)::bigint AS total_duration
FROM public.lessons
WHERE course_id IS NOT NULL
GROUP BY course_id;

GRANT SELECT ON public.mv_course_lesson_stats TO anon, authenticated;

-- Refresh via existing cron / trigger on lessons write.
```

Then point `src/pages/Courses.tsx` at the materialized view instead of the RPC. Not required for security; deferred to the perf backlog.

## Wins (unchanged from 2026-07-21 hardening)

- Every `SECURITY DEFINER` function has `SET search_path` pinned.
- Trigger-only functions carry no `authenticated` grant.
- Every `admin_*` function self-authorizes via `has_role(auth.uid(),'admin')` before any side effect and writes to `audit_log`.
- Sensitive column projection (`video_url`, `class_pdf_url`, `transcript_md`) is gated by enrollment/role inside `get_course_bundle`.
- No function stores or returns secrets.

## Fix Plan

1. **Apply now** — findings #1 and #2 in one migration. Zero admin-UI impact.
2. **Backlog** — finding #3, bundle with the `perf-exam-ready` sweep.
3. **Regression guards** to add to CI:
   - `rg -n "\.rpc\('check_rate_limit_text'" src/` returns 0.
   - Playwright probe for finding #1.
   - Nightly `supabase--linter` in the audit checklist.

## Open questions

- Confirm no external cron/CLI calls `check_rate_limit_text` from a non-`service_role` context before the REVOKE lands.
- Should `get_platform_stats` be cached at the edge (60 s TTL) to further reduce DB pressure from anon crawlers?

Used the red-team-security-audit + supabase-architect-auditor skills.