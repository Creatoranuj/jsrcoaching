# Audit: profiles integrity, enrollment payment gate, offline library

Date: 2026-07-31
Skills applied: senior-architect-audit, supabase-architect-auditor, console-error-triage,
capacitor-security, razorpay-payments, app-crash-shield.

**Rating: 4/5** — the reported crash is fixed at the data layer and the paid-enrollment gate is
now proven by execution, not by reading code; one point withheld because the admin route and
`/downloads` could not be exercised with a real signed-in session in this environment
(`LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`), and 12 pre-existing unit tests are red.

## Findings

### [CRITICAL] [DATA] `public.profiles` had no primary key and 10 duplicated user ids
**Where:** `public.profiles`, surfaced through `admin_get_user_snapshot` →
`src/pages/AdminStudentDetail.tsx`.
**Evidence:** `pg_constraint` and `pg_indexes` returned zero rows for the table; the table held
23 rows for 13 distinct ids. The snapshot function reads
`(SELECT to_jsonb(p) FROM profiles p WHERE p.id = _user_id)` as a scalar subquery, which raises
`more than one row returned by a subquery used as an expression` — exactly the toast in the
screenshot.
**Why it matters:** every single-profile read (admin student page, name/avatar resolution,
`enforce_user_name_from_profile`, `enforce_not_blocked`) was one duplicate away from an error or
a wrong answer, and a blocked user could resolve against the non-blocked copy.
**Fix (applied):** de-duplicated keeping the most complete row per id (one pair differed only in
`mobile`; the row carrying the number was kept), then
`ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id)` plus
`profiles_email_idx`. Verified: `count(*) = count(DISTINCT id) = 13`.

### [HIGH] [DATA] `handle_new_user` could re-create a duplicate profile
**Where:** `public.handle_new_user`, trigger `on_auth_user_created` on `auth.users`.
**Evidence:** the insert had no conflict clause; the duplicate set above is the observed result.
**Fix (applied):** `INSERT ... ON CONFLICT (id) DO NOTHING`.

### [HIGH] [AUTHZ] `get_user_role` was non-deterministic for multi-role accounts
**Where:** `public.get_user_role`.
**Evidence:** all three admin accounts hold both `admin` and `student` rows in `user_roles`, and
the function used `LIMIT 1` with no `ORDER BY` — Postgres may return either row.
**Why it matters:** an admin could be resolved as a student by any UI that trusts this function,
producing intermittent loss of admin surfaces.
**Fix (applied):** ordered by precedence `admin > teacher > student`. `has_role()` (which every
RLS policy uses) was already exact-match and unaffected.

### [MEDIUM] [DATA] `get_user_profiles_admin` returned one row per role
**Where:** `public.get_user_profiles_admin`.
**Evidence:** `LEFT JOIN user_roles` with no aggregation → the three dual-role admins appeared
twice in the admin user list.
**Fix (applied):** selects from `profiles` only and resolves the role through `get_user_role`.

### [MEDIUM] [RELY] `/downloads` could fail silently on IndexedDB errors
**Where:** `src/hooks/usePersonalLibrary.ts:38`, `src/components/library/personal/MyLibrary.tsx:103`.
**Evidence:** `refresh()` awaited `listFolders`/`listAllFolders`/`getUsedBytes` with a `finally`
but no `catch`; the breadcrumb effect awaited `folderDB.get` with no `catch`. On an unavailable
store (private mode, evicted origin data, Android WebView storage reset) both produce unhandled
rejections and a permanently blank storage bar.
**Fix (applied):** both paths now report through `reportError` with a `surface`, the hook exposes
an `error` string, and `MyLibrary` renders an inline message with a Retry button. The in-flight
guard now coalesces a concurrent refresh instead of dropping it, so counts are no longer stale
after a delete.

### Payment gate — verified, no hole found
Proven by execution against the live database under
`request.jwt.claims.sub = <a student account>`:

| Attempt | Result |
| --- | --- |
| Insert own enrollment into paid course 15 with no payment | `Payment required before enrolling in this course` |
| Insert an enrollment for another user | `You can only enroll yourself` |
| Grant self the `admin` role | `You cannot grant yourself elevated roles` |

(The probe ran inside a `DO` block that aborted, so nothing was committed.)

Defense in depth confirmed: `enrollments` has a BEFORE INSERT trigger
(`trg_enforce_enrollment_payment`), BEFORE UPDATE guards
(`guard_enrollment_update_trg`, `trg_prevent_enrollment_status_tampering`), **and** an RLS INSERT
policy requiring either a free course or a `razorpay_payments` row with `status = 'completed'`
for the same user and course. `status = 'completed'` is written in only two places, both after a
server-side HMAC signature check and a `captured` confirmation from Razorpay
(`verify-razorpay-payment`, `razorpay-webhook`); the webhook short-circuits on an
already-`completed` record, so replay is idempotent.

### Capacitor hardening — verified, no change needed
`allowMixedContent: false`; `webContentsDebuggingEnabled` gated on `CAP_DEBUG`;
`androidScheme: 'https'` with a narrowed `allowNavigation`; manifest sets
`usesCleartextTraffic="false"`, `allowBackup="false"` and a `networkSecurityConfig`; a CSP meta
tag is present in `index.html`; no secret literals found in `src/`. The `capsec` CLI is not
published to the reachable registry, so these checks were performed manually against the same
rule set.

### Console triage
`/`, `/courses`, `/downloads` were loaded headless: **zero `pageerror` events**; `/courses` and
`/downloads` correctly redirect to `/login` when signed out. The remaining console noise is a
dev-only React "Function components cannot be given refs" warning originating in library
wrappers (`Navigate`, `TooltipProvider`, `AlertDialogPortal`); React strips these in production
builds, so they do not reach the Sentry forwarder. Left as-is.

## Wins
- Roles are stored only in `user_roles` and every policy goes through `has_role`.
- `prevent_self_role_escalation` is attached and blocks self-promotion at the database.
- Payment enforcement exists at three independent layers.
- Signup grants `student` only; admin creation is behind the password-gated `admin-register`
  edge function.

## Known-open / not addressed
- 12 pre-existing unit tests fail on `main` in `Login.test.tsx` (ambiguous "sign in" button
  query), `pdf-system.test.ts` (2) and `signedSmokeRegression.test.ts` (1). None touch the code
  changed here; they are assertion drift, not app faults.
- The admin Student page and `/downloads` were not exercised signed-in — this project uses an
  external Supabase, so no browser session can be minted here. **UNVERIFIED** at the UI level;
  the underlying RPC was fixed and proven at the SQL level.
