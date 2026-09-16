# Audit — Enrollment, PDF reader chrome, resume refresh (2026-09-16)

**Rating: 4/5** — the enrollment blocker had a real, reproducible root cause and is fixed at the database layer; reader chrome and resume-refresh are now predictable. Remaining gap: Play Console credentials and the Supabase linter backlog are still open, and E2E coverage for the enroll path is thin.

## Findings

### [CRITICAL] [DATA/AUTHZ] Enrollment write failed for every signed-in user — missing UPDATE grant
**Where:** `public.enrollments` (table privileges), surfaced from `src/hooks/useAdminEnrollment.ts:56`
**Reproduced:** signed in as `jsrcoachinginstitute@gmail.com` against the live PostgREST endpoint and issued the same upsert the app issues:
```
POST /rest/v1/enrollments?on_conflict=user_id,course_id
→ 403 {"code":"42501","message":"permission denied for table enrollments"}
```
`has_role(uid,'admin')` returned `true`, all enrollment policies were present, and the only triggers on the table are UPDATE-time. Privilege dump showed the cause:
`relacl = {authenticated=ardDxtm/postgres}` — no `w` (UPDATE). An upsert needs INSERT **and** UPDATE, so RLS never got a chance to run. The same gap silently broke `progress_percentage` / `last_watched_lesson_id` writes for students.
**Fix (applied, migration):** `GRANT UPDATE ON public.enrollments TO authenticated;`
Policies unchanged — a student is still limited to their own row via `Users can update own enrollment progress` + `enrollment_update_allowed(...)`, admins via `has_role(auth.uid(),'admin')`.
**Verified after fix:** admin upsert → `201` row created; `PATCH progress_percentage=7` → row updated; self-enroll gate still holds — for both paid courses (id 30 ₹199, id 34 ₹1) `coalesce(price,0)<=0` is false and no `razorpay_payments.status='completed'` row exists for a student, so a student self-enroll is still denied. Test rows removed afterwards.

### [HIGH] [OBS/UX] "Enroll nahi ho paaya — dobara try karo" hid a non-retryable error
**Where:** `src/hooks/useAdminEnrollment.ts:76`
**Why it matters:** a `42501` permission error can never be fixed by retrying; the copy sent users into an infinite retry loop and hid the real cause from support.
**Fix:** permission errors now say the write was blocked by permissions; other failures include the actual message. Sentry reporting unchanged.

### [MEDIUM] [RELY] Resume refresh could hang the "Refreshing" state forever
**Where:** `src/App.tsx:167`
**Why it matters:** `queryClient.invalidateQueries()` invalidated *every* query (including inactive ones) with no timeout and no overlap guard. On a slow or dropped connection after returning from the background, the refetch stayed pending and screens kept their refreshing state; repeated resume events stacked more refetches.
**Fix:** single-flight guard, `type: "active"` scope, `.catch()` fallback to cached data, and an 8s hard timeout that releases the guard.

### [MEDIUM] [VIS/MOT] "Full page" pill competed with the PDF and never went away
**Where:** `src/pages/LessonView.tsx` (class-PDF slot and attachment reader)
**Why it matters:** a labelled text pill sitting permanently over the page content is heavier than the reader needs; the surrounding chrome already auto-hides, so the pill was the only element that stayed. Reference: iOS Books / Linear reader chrome — a single icon affordance that fades with the rest of the chrome.
**Fix:** `Maximize2` + "Full page" → 44×44 icon-only `Eye` button that fades with `chromeVisible` (opacity + `pointer-events-none`), and the class-PDF surface now participates in the same reveal-on-tap / hide-after-~2.5s timer as the attachment reader. Tap target stays ≥44px.

## Wins
- Enrollment policies themselves were already correct and defence-in-depth (payment-verified paid enrolment, admin-only override) — only the grant was missing.
- Reader auto-hide, back-button sentinel, and crash-shield resume recovery are well-commented and single-owner.
- Unit tests, typecheck, and the signed APK build are all green on the fix commit.

## Fix Plan
1. Applied now: enrollment UPDATE grant, honest enroll error, Eye button + auto-hide, resume-refresh guard.
2. Next: add an E2E case that asserts a student cannot self-enroll into a paid course and that an admin can.
3. Backlog: Supabase linter items (24 signed-in-executable SECURITY DEFINER functions, 1 anon-executable, 1 RLS-enabled-no-policy table, leaked-password protection off).

## Open items needing the user
- Play Console service-account JSON (secure form) — Play upload keeps skipping without it.
- Chat-shared admin password should be rotated.
