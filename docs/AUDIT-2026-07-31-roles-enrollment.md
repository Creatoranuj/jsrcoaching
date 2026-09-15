# Audit: Roles, Enrollment Payment Gate, Crash Shield — 2026-07-31

**Rating: 4/5** — the two requested holes (admin-role self-grant on signup, and enrollment without payment) are now closed with server-side triggers plus tightened RLS; remaining deductions are broad `anon` GraphQL/table exposure and the fact that the signed-in enrollment bypass could not be executed end-to-end in this session.

Lenses applied: `senior-architect-audit`, `supabase-architect-auditor`, `app-crash-shield`.

---

## Findings

### [CRITICAL] [AUTHZ] Anyone signing up with the stored admin email became admin — FIXED
**Where:** trigger `on_auth_user_created_admin` → `public.assign_admin_on_signup()` on `auth.users`
**Evidence:** `pg_get_triggerdef` showed the trigger active; the function compared `lower(NEW.email)` against `site_settings.admin_email` and inserted `role = 'admin'`.
**Why it matters:** the admin address is public knowledge (it appears on the site). Anyone who signed up with it — before the real admin did, or after an account deletion — received full admin rights. Email is an identifier, not a credential.
**Fix applied:** trigger and function dropped. Signup now runs only `handle_new_user` (profile) and `handle_new_user_role` (assigns `student`). Verified: 3 existing admin rows and 13 student rows in `user_roles` are untouched.

### [CRITICAL] [SEC] No first-class admin registration path — FIXED
**Where:** `src/pages/AdminRegister.tsx:44` (form was hard-disabled), `supabase/functions/setup-admin/index.ts` (only *verifies* an existing admin, never promotes)
**Why it matters:** with the email trigger removed there would have been no way to create an admin at all, and the "separate admin signup with a secret code" you asked for did not exist server-side.
**Fix applied:** new edge function `supabase/functions/admin-register/index.ts`:
- validates email / name / password (min 10 chars) before anything else,
- compares the submitted admin code against the `ADMIN_PASSWORD` secret with a length-safe constant-time-style comparison,
- logs failed attempts to `security_alerts` with the source IP,
- creates the user with the **service-role** client and inserts the `admin` role, rolling the auth user back if the role insert fails,
- writes an `audit_log` entry.
The code is never shipped to the browser bundle. `AdminRegister.tsx` now calls this function instead of `auth.signUp`.

### [HIGH] [AUTHZ] Admins could grant themselves any role — FIXED
**Where:** policy `"Admins can manage roles"` on `public.user_roles`, `FOR ALL TO public`, `with_check = NULL`
**Evidence:** the `pg_policies` row had a NULL check clause, so the USING clause (`has_role(auth.uid(),'admin')`) doubled as the write check — self-targeting rows passed.
**Fix applied:** the 8 overlapping policies were collapsed into 5 explicit ones — `roles_select_own`, `roles_select_admin`, and insert/update/delete for admins restricted to `user_id <> auth.uid()`. `prevent_self_role_escalation()` was rewritten so *nobody*, admin included, can elevate their own row, and it is enforced by a `BEFORE INSERT OR UPDATE` trigger.

### [HIGH] [DATA] Enrollment could be moved to a paid course after the fact — FIXED
**Where:** `enrollments` UPDATE policy (`auth.uid() = user_id` on both sides)
**Why it matters:** the INSERT policy checks payment, but the UPDATE policy did not pin `course_id`. A student could self-enroll in a free course and then repoint that row at a paid one.
**Fix applied:** `guard_enrollment_update` is confirmed attached as `guard_enrollment_update_trg` (my plan wrongly said it was missing — the earlier query used an unqualified `regclass` comparison and did not match; corrected here). On top of it, a new `BEFORE INSERT` trigger `trg_enforce_enrollment_payment` re-checks, server-side and independent of RLS, that:
- the row belongs to the caller,
- the course exists,
- for `price > 0` there is a `razorpay_payments` row for that exact user **and** course with `status = 'completed'` **and** `amount >= price`,
- `status` is forced to `'active'` (clients cannot set it).
Service-role and admin/teacher writes bypass the check, so the webhook and `complete_paid_enrollment` still work.
`'completed'` is the correct status string — both `razorpay-webhook/index.ts:297` and `verify-razorpay-payment` write it.

### [MEDIUM] [MAINT] Duplicate triggers firing twice — FIXED
`prevent_self_role_escalation` and `guard_enrollment_update` each ended up with two triggers. The redundant ones added in the first migration were dropped.

### [MEDIUM] [OBS] Stale integration tests asserted the wrong security posture — FIXED
`src/test/definer-grants.integration.test.ts` expected `get_platform_stats` and `search_lectures` to be anon-callable. Anon EXECUTE was intentionally revoked earlier (stats now go through the `platform-stats` edge function; lecture search requires a session). The tests were inverted to assert denial, so they now protect the intended posture instead of fighting it.

### [MEDIUM] [SEC] Broad `anon` visibility in the GraphQL schema — OPEN
The linter reports ~115 `0026_pg_graphql_anon_table_exposed` warnings. These are discoverability warnings, not open reads — RLS still gates rows — but tables that have no anon-facing policy should have `SELECT` revoked from `anon` so they stop appearing in the public schema. This is a broad sweep across ~75 tables and is deliberately left for a separate, reviewed pass rather than bundled into a security fix.

### [LOW] [CONFIG] `phone_otps` has RLS enabled with zero policies — INTENTIONAL
Linter `0008`. Correct: the table is service-role-only and must never be reachable from the client.

### [N/A] [A11Y] [UX]
Out of scope for this change — no user-facing layout was touched beyond the admin registration submit handler.

---

## Crash-shield lens

- `src/lib/crashShield.ts` — heartbeat watchdog with a 10s freeze threshold, visibility-aware suppression, Sentry breadcrumb before reload, and a sessionStorage cooldown capping auto-reload at 1 per 60s. No infinite reload loop. ✅
- `src/components/ErrorBoundary.tsx` — one silent auto-reload per 60s window, guarded by `nb_eb_auto_reload_at`; the manual retry clears all cooldown keys. ✅
- No `key={index}` on reordered lists and no auth tokens in `localStorage` found in `src/`. ✅
- No change required — this lens passes as-is.

---

## Wins

- Roles live only in `public.user_roles` and are read through the `has_role` security-definer function.
- Payment truth is webhook-first; the client never writes `razorpay_payments`.
- Validation is done with triggers rather than CHECK constraints, so time/auth-dependent rules work.
- Every SECURITY DEFINER function sets `search_path = public`.

---

## Fix plan

1. **Done now:** admin auto-grant removed, admin-register edge function, role-escalation trigger, policy cleanup, enrollment payment trigger, duplicate-trigger cleanup, test posture corrected.
2. **Next:** revoke `SELECT` from `anon` on the non-public tables flagged by lint 0026; enable Leaked Password Protection in Supabase Auth (see `docs/SECURITY-FIX-2026-07-06-definer-grants.md`).
3. **Backlog:** run `src/test/enrollment-bypass.integration.test.ts` with real signed-in credentials in CI — it is currently skipped without them.

## Not verified

The enrollment bypass fix was verified structurally (trigger attached, function logic, policy rows) but **not** executed against a live signed-in student session in this environment, because no test student credentials are available here. The `enrollment-bypass` integration test skips for the same reason.
