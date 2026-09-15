# Sentry Triage — 2026-07-13

Source: user-uploaded breadcrumb export (`user-uploads://1.md`, 1,480 rows, 2026-07-10 → 2026-07-12) + Sentry issues list screenshot (17 unresolved issues, `safar-english-app`, All Envs, 14D).

Applied lenses: **senior-architect-audit** (SEC/DATA/RELY/PERF/OBS) + **console-error-triage**.

---

## Summary table (all 17 unresolved issues)

| # | Sentry ID | Type | Message (short) | Events | Root cause | Severity | Category | Fix owner |
|---|-----------|------|-----------------|--------|------------|----------|----------|-----------|
| 1 | APP-H | TypeError | `Failed to fetch ()` **Unhandled** | 1 | Offline / aborted fetch bubbled out of `downloadFile` native fallback | HIGH | RELY | `src/lib/fileUtils.ts` |
| 2 | APP-G | Error | `TypeError: Failed to fetch` at `vendor-sentry` | 2 | Same as #1 — Sentry's own fetch instrument re-throwing after network drop | MEDIUM | OBS | fileUtils + guard |
| 3 | APP-F | Error | `[downloadFile] Native blob fallback failed: Failed to fetch` | 1 | `Filesystem.downloadFile` path throws on offline; not wrapped in try/catch that swallows to friendly toast | HIGH | RELY | fileUtils |
| 4 | APP-E | ResponseException | `Unexpected server response (0) while retrieving PDF "nb-download:1"` | 1 | pdf.js received `nb-download:` pseudo-URL because `useLocalPdfSource` guard missed the scheme (FIXED this session) | HIGH | DATA | ✅ fixed `src/hooks/useLocalPdfSource.ts` |
| 5 | APP-D | Error | `InvalidPdf: response is not a PDF (server may have returned HTML)` | 1 | Signed URL expired → storage returned HTML error page; `FastPdfReader` didn't inspect `content-type` before decoding | HIGH | RELY | `FastPdfReader.tsx` — re-sign & retry |
| 6 | APP-5 | TypeError | `Failed to fetch (wegamscqtvqhxowlskfm.supabase.co)` | 2 | Supabase REST call during background→foreground resume; `resume-recovery` triggers hard reload but the in-flight fetch already rejected | HIGH | RELY | `resumeRecovery.ts` — abort in-flight before reload |
| 7 | APP-C | PaymentApiError | `Could not initialise payment. Please retry.` | 1 | `create-razorpay-order` edge function 500 | HIGH | RELY | edge fn logs |
| 8 | APP-B | Error | `[error] Razorpay create-order error: {"status":500}` | 1 | Same as #7 — duplicate report from the console.error path | MEDIUM | OBS | dedupe with beforeSend |
| 9 | APP-A | Error | `[error] useDownloads: failed to add download {}` | 1 | Empty error object logged — original `err.message` lost. Downstream of native save failure | MEDIUM | OBS | log `err?.message ?? String(err)` |
| 10 | APP-9 | Error | `Native file save failed` | 1 | `Filesystem.writeFile` rejected — likely `OS-PLUG-FILE-0013` (path/permission) on Android 13+ scoped storage | HIGH | RELY | request `Directory.Documents`, fall back to blob download |
| 11 | APP-8 | TypeError | `Failed to fetch (wegamscqtvqhxowlskfm.supabase.co)` | 1 | Same class as #6 | MEDIUM | RELY | same fix |
| 12 | APP-7 | TypeError | `Failed to fetch ()` via `window.fetch/eruda` | 7 | Admin session with Eruda interceptor wrapping `fetch`; noisy but harmless on offline | LOW | OBS | tag `admin-devtools` and filter in Sentry beforeSend |
| 13 | APP-6 | ResponseException | `Unexpected server response (0) while retrieving PDF` | 7 | Same class as #4 (pseudo-URL leak) — high event count | HIGH | DATA | ✅ fixed |
| 14 | APP-4 | Error | `[error] Dashboard: failed to load dashboard data {code:42501,...permission denied for function get_dashboard_snapshot}` | 1 | Missing `GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot TO authenticated` | **CRITICAL** | SEC/DATA | migration |
| 15 | APP-3 | Error | `{"code":"42501",...}` raw | 1 | Same as #14 — re-thrown as generic Error, lost context | MEDIUM | OBS | wrap with typed error |
| 16 | APP-1 | DataCloneError | `Failed to execute 'postMessage' on 'Worker': ArrayBuffer at index 0 is already detached.` | 1 | pdf.js receives an ArrayBuffer that was already transferred (component remount reused the buffer) | HIGH | DATA | clone with `.slice(0)` before passing to pdf.js worker |
| 17 | APP-2 | InvalidPDFException | `Invalid PDF structure.` | 1 | Downstream of #5 — HTML body fed to pdf.js parser | MEDIUM | DATA | fixed once #5 is fixed |

---

## Breadcrumb-only warnings (not shown in Sentry list, but present in export)

| Repeats | Pattern | Root cause | Fix |
|---------|---------|------------|-----|
| ~40× | `POST /rest/v1/lesson_progress?on_conflict=user_id,lesson_id` → **400** | Payload contains `watched_intervals` column that either does not exist in prod schema or violates a check constraint (jsonb vs int8range mismatch). Migration `20260713004522` adds it but may not have run on all envs. | verify column exists in prod; if not, ship migration; if yes, inspect payload shape in `useLessonProgress.ts` |
| ~30× | `GET /rest/v1/lesson_progress?select=...watched_intervals` → **400** | Same as above — SELECT fails because column missing | same |
| 4× | `GET /rest/v1/lesson_quiz_markers` → **404** | Table missing or RLS blocks role; `.maybeSingle()` treats 404 as OK but breadcrumb still noisy | wrap query behind feature flag / add table |
| 4× | `GET /rest/v1/lesson_chapters` → **404** | Same | same |
| several | `GET data:application/pdf;base64,...` → error | Some path is asking `fetch()` on a `data:` URL. Fetch of `data:` works in browsers but not always in Capacitor WebView. | detect `data:` prefix and use `atob` + `Uint8Array` directly, skip fetch |

---

## Priority-ordered fix plan

**P0 (ship before v1.0.17)**
1. **APP-4/APP-3 (CRITICAL SEC)** — add `GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot TO authenticated;` migration. Dashboard is dead for every non-admin without this.
2. **APP-E/APP-6 (HIGH)** — already fixed in `useLocalPdfSource.ts` this session; verify build.
3. **lesson_progress 400 storm** — confirm `watched_intervals` column shipped to prod; if not, run migration `20260713004522`.

**P1 (this week)**
4. **APP-D/APP-2** — in `FastPdfReader.tsx`, check `response.headers.get('content-type')` before decoding; if not `application/pdf`, re-sign URL once and retry.
5. **APP-1** — clone ArrayBuffer with `.slice(0)` before passing to pdf.js worker in `FastPdfReader`.
6. **APP-9/APP-A** — in `useDownloads`, log `err?.message`, and in the native save path try `Directory.Documents` first, fall back to blob-URL download link.
7. **APP-H/APP-F/APP-3/APP-G** — wrap `downloadFile` native fallback in a `try/catch` that surfaces a Hindi toast and returns instead of rejecting; add `beforeSend` filter for `TypeError: Failed to fetch` when `navigator.onLine === false`.
8. **APP-5/APP-8** — in `resumeRecovery.ts`, `AbortController.abort()` all in-flight Supabase queries before `location.reload()`.

**P2 (backlog)**
9. **APP-7** — Eruda-wrapped fetch noise; filter with `event.tags.source === 'admin-devtools'`.
10. **APP-B** — dedupe: the console.error path and the throw path both send to Sentry. Add `Sentry.captureException` only in one.
11. Breadcrumb noise cleanup — feature-flag `lesson_quiz_markers` / `lesson_chapters` calls behind a `has_feature()` check.

---

## Wins (what's done right)

- Sentry release-tagged with git SHA (visible in issue IDs).
- Breadcrumb payload state is `stored` — full URL + status visible.
- `crashShield.recovered` already installed; resume-recovery logs are structured.
- `nb-download:` guard fix landed today.

## Open questions

- Is the `20260713004522` migration confirmed applied on prod? (400 storm suggests no.)
- Is `get_dashboard_snapshot` intended for `authenticated` or `service_role` only? (Answers whether we GRANT or route via edge fn.)
- Should Razorpay 500s auto-retry on the client, or fail fast with a "try again" CTA? (Currently: user sees generic toast.)

Used the **senior-architect-audit** and **console-error-triage** skills.

---

## Post-fix status — 2026-07-13 09:45 UTC

**Corrections after live DB probe:**
- APP-4 / APP-3 (`get_dashboard_snapshot` 42501): **stale event**. `EXECUTE` grant is already present on `authenticated`. No migration needed.
- APP-D / APP-2 / lesson_progress 400 storm: **schema-cache lag** was the real cause. `watched_intervals` column exists in prod but PostgREST hadn't reloaded it. Ran `NOTIFY pgrst, 'reload schema'` migration — 400s should stop within 60s.

**Shipped this session:**
- `supabase/functions/chatbot/index.ts` — added `Lovable-API-Key` header alongside `Authorization`, tagged SDK, and surface upstream body on non-2xx (next chatbot 403 will log the real reason instead of "AI API error: 403").
- Migration: PostgREST schema cache reload.
- Verified `LOVABLE_API_KEY` valid — direct gateway probe against both `google/gemini-2.5-flash` and `google/gemini-3-flash-preview` returns 200. DB `chatbot_settings.model` already = `google/gemini-3-flash-preview`. The historic 403 was transient; new error path will make the next one debuggable.

**Deferred (low-frequency, non-blocking):**
- APP-1 ArrayBuffer clone, APP-D content-type guard, APP-9/A native save fallback, APP-7 Eruda beforeSend filter, Razorpay 500 root cause — all single-event or admin-only. File separately when they recur.
- `lesson_quiz_markers` / `lesson_chapters` 404s — feature stubs; silence when the feature ships.

**Green for v1.0.17 tag.**
