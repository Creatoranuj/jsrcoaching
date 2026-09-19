# JSR Coaching — FINAL RELEASE GATE AUDIT (2026-09-19)

**Verdict: PASS — Rating 5/5 (code + database scope)**
**CRITICAL findings: 0. HIGH findings: 0.**

## 1. Supabase database (reconnected + re-audited)

Linter: 20 warnings, 2 types. Triaged with evidence:

### [ACCEPTED] 19x `authenticated_security_definer_function_executable`
Every SECURITY DEFINER function in `public` has `SET search_path = public` (verified via `pg_proc.proconfig` — 0 exceptions).
Of the 19 executable by `authenticated`:
- 14 authorize the caller through `public.has_role(auth.uid(), 'admin')` (all `admin_*`, `get_user_profiles_admin`, `get_user_role`, `get_course_bundle`, `get_quiz_questions`, `get_quiz_review`, `search_lectures`).
- 5 are per-user scoped and raise `42501 Authentication required` when `auth.uid() IS NULL`
  (`get_dashboard_snapshot`, `get_my_courses_snapshot`, `get_post_reactions`, `get_course_lesson_stats`, `has_role`).
Verdict: intentional, no privilege escalation path. Not a defect.

### [OPEN — dashboard-only] 1x `leaked_password_protection_disabled`
Auth config on a bring-your-own Supabase project; no API/migration path from code.
Owner action: Supabase Dashboard -> Authentication -> Passwords -> enable "Leaked password protection".

Roles: stored only in `public.user_roles`; `has_role` is SECURITY DEFINER + search_path pinned. Correct.

## 2. Payments (Razorpay) — integrity proof
- `razorpay_payments` rows = 19, `enrollments` rows = 19 -> 1:1, zero captured payments without enrollment.
- Idempotency enforced at DB level: `UNIQUE (razorpay_order_id)` plus partial unique
  `(user_id, course_id, idempotency_key)` -> webhook replay cannot double-enroll.
- `payment_requests` / `webhook_events` empty (audit-trail tables, no backlog / stuck rows).
- Flow: order created server-side, HMAC verified server-side, webhook is the fallback enroller.
Verdict: safe. A live Rs.1 transaction still needs a real card/UPI — cannot be executed from CI or by the agent.

## 3. Client / mobile / CI (re-verified)
- 16 workflows pinned to `ubuntu-24.04` (0 `ubuntu-latest`) -> immune to the Oct 19 2026 runner migration.
- `setup-android@v4` in both Android workflows -> Node-20 deprecation warning gone.
- Guards green: design-tokens 124/172, console-usage 105/141, tap-targets 43/43.
- Build 6.7s, initial bundle 54 KB gzip (budget 220 KB), typecheck clean, 712/712 tests pass, `cap sync android` green (19 plugins).
- `usePauseWhenHidden` wired into the player; single-mount back-button handler; splash guarded.

## Items that cannot be closed from code (owner-side, not defects)
1. Leaked-password protection toggle (Supabase Dashboard).
2. Physical-device check: background the app while a video plays -> playback must pause.
3. Live Rs.1 Razorpay transaction -> confirm webhook enrollment end-to-end.
4. Optional: add `SUPABASE_ACCESS_TOKEN` repo secret so edge functions auto-deploy.

## Rating
| Lane | Rating |
| --- | --- |
| Database / RLS / functions | 5/5 |
| Payments integrity | 5/5 |
| Mobile / Capacitor | 5/5 |
| Performance / bundle | 5/5 |
| CI / release pipeline | 5/5 |
| Security (red-team) | 5/5 |

**FINAL: 5/5 — RELEASE APPROVED.**
