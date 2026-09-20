# Sentry triage — 2026-09-19

Org `safar-english` · project `safar-english-app` · window: last 14 days · env: production (APK + web).
Fix commit: `3ed6408` · release `v2026.9.19.1`.

## Summary — unresolved issues at start of triage

| Sentry ID | Type | Message (short) | Events | Root cause | Sev | Cat | Fix |
|---|---|---|---|---|---|---|---|
| APP-13 | Error | `[unhandledrejection] "RazorpayNative.then()" is not implemented on android` | ~120 (with -14) | `src/lib/native/razorpay.ts` returned the bare Capacitor proxy from an `async` fn → Promise assimilation read `.then` → native call → UNIMPLEMENTED. Loader always rejected; BuyCourse fell back to browser checkout. | CRITICAL | RELY | `razorpay.ts` `{ plugin }` container; `razorpayNative.ts`, `upiApps.ts` destructure. Guard `src/test/nativeLoadersThenSafe.test.ts` |
| APP-14 | Error | same, caught path | (shared) | same | CRITICAL | RELY | same |
| APP-18 | ReferenceError | `Cannot access 'Er' before initialization` (LessonView chunk, `/classes/34/lessons`) | 12 | `src/pages/LessonView.tsx` `handleVideoTimeUpdate` deps array read `reportLessonProgress` (a `const` from `useLessonProgress`) declared lower in the same scope. Minified bundle hoists differently → TDZ. Same pattern in `AdminQuizManager.tsx` init effect. | CRITICAL | MAINT | Reordered; imports hoisted; ESLint `no-use-before-define` (same-scope) = error; `src/test/tdzLintGuard.test.ts` |
| APP-15 | Error | `recover-enrollment failed` | few | `useEnrollmentRecovery.ts` generic `reportError(new Error("recover-enrollment failed"))` for every non-404 outcome incl. 401 (expired session) and offline | HIGH | OBS | `recoverEnrollmentDetailed()`; auth/offline → breadcrumb; server → one `EnrollmentRecoveryError("recover-enrollment <status> <code>")` |
| APP-16 | Error | `[error] recover-enrollment failed {"courseId":34}` | few | `src/lib/sentry.ts` console forwarder re-captured `logger.error`'s own `console.error` mirror → second issue for the same event | MEDIUM | OBS | Forwarder skips args starting with `"[error] "` |
| APP-17 | Error | `{"courseId":34}` | few | `useEnrollmentArrival.ts` called `logger.error("recover-enrollment failed", { courseId })` — context object in the *error* slot became the title | MEDIUM | OBS | Call removed (breadcrumb); `logger.error()` promotes a plain object in the error slot to context |
| APP-19 | Error | `[ChatWidget] chatbot call failed AI gateway authentication failed.` | 2+ (will spike) | Edge fn `chatbot` returns 503 `gateway_unauthorized` when the Lovable AI gateway rejects `LOVABLE_API_KEY`. Client reported every keystroke. **Server cause still open** — see Owner actions. | HIGH | CONFIG | Client: one report per failure class per page-load, stable title `[ChatWidget] chatbot gateway_unauthorized (server config)` |
| (pdf-proxy 403) | ResponseException | `403` on `pdf-proxy?kind=url&…jsdelivr…` | few | `supabase/functions/pdf-proxy` `authorizeUrl()` enrollment gate returned 403 for a non-enrolled/expired-session user; `FastPdfReader.onLoadError` captured it as an exception and the copy blamed the CDN link | LOW | UX/OBS | 403/404 no longer captured; `pdfErrorMessage.ts` explains the enrollment gate. Issue ID could not be re-resolved via API after the workspace move — resolve manually in Sentry |

## Breadcrumb-only warnings (actionable, never became issues)

| Signal | Count/notes | Action |
|---|---|---|
| `POST /functions/v1/recover-enrollment` 404 on `/my-courses` arrival | frequent right after purchase | Expected (webhook race). Already normalised to `not-yet`; no change. |
| `PATCH rest/v1/user_sessions` every 5 min per open tab | top egress driver in earlier slow-query read | Bandwidth item — see architect audit P2. |
| `Failed to fetch` via Eruda fetch wrapper (admin devtools only) | admin sessions | Filter in `beforeSend` when `stack` contains `eruda` — P3. |

## Priority-ordered fix plan

### P0 — shipped in `3ed6408`
1. Native Razorpay loader container (`APP-13/14`).
2. LessonView / AdminQuizManager TDZ + lint gate (`APP-18`).

### P1 — shipped in `3ed6408`
3. recover-enrollment single canonical report + cause-specific UI (`APP-15/16/17`).
4. ChatWidget failure-class dedupe (`APP-19` client half).

### P1 — owner action (cannot be done from code)
5. **Update `LOVABLE_API_KEY` in Supabase → Edge Functions → Secrets** for project `wegamscqtvqhxowlskfm`. The project moved Lovable workspaces on 2026-09-19; the key baked into the edge-function secrets belongs to the old workspace and the AI gateway now answers 401 → students see "server key issue" in chat. After updating, redeploy `chatbot` (workflow `deploy-functions.yml`) and send one chat message; the `[ChatWidget] chatbot gateway_unauthorized` issue must not recur.

### P2 — shipped / backlog
6. PDF 403/404 not captured; enrollment-gate copy (shipped).
7. Eruda fetch-wrapper noise filter in `beforeSend` (backlog).
8. `user_sessions` heartbeat: move from 5-min `PATCH` to `visibilitychange`-driven flush (backlog, needs egress baseline).

## Wins
- Every payment / PDF / chat failure already carried breadcrumbs with status + host — root-causing took minutes, not hours.
- `logger.error` centralisation meant the OBS fixes were 3 small edits, not 174 call-site edits.
- `isAbortLike()` and the byte-fallback 403/404 rule in `FastPdfReader` were already correct; only `onLoadError` lagged.
- The Capacitor loaders in `app.ts`, `preferences.ts`, `filesystem.ts`, `core.ts`, `sessionTracker.ts` all had the container shape — one file drifted, and the new static test stops the next drift.

## Open questions
- Was `min_android_version` in `app_config` bumped after `v2026.9.19-pay`? If not, users on the pre-plugin APK will keep hitting `RazorpayBridgeMissingError` (a *different*, already-handled error) until the store update lands.
- Should the `recover-enrollment` 429 (5 req / 60 s) count per user or per device? Two tabs on My Courses can burn the budget in one arrival.

Used the sentry-triage skill.
