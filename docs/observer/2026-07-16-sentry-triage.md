# Sentry Triage — 2026-07-16 (breadcrumb export `Trace_error.md`)

Skills applied, in order: **sentry-triage → console-error-triage → senior-architect-audit → debugging-capacitor**.
Source: 188-line breadcrumb export, single session (`2026-07-13T08:35–08:36Z`). PII redacted throughout.

## 1. Summary — issues in this session

| # | Type / Message | Count | Root cause (file:line) | Category | Severity | Status |
| - | -------------- | ----- | ---------------------- | -------- | -------- | ------ |
| 1 | Full `data:application/pdf;base64,<HTML>` body captured in fetch breadcrumb | 1 | `src/lib/sentry.ts` `beforeBreadcrumb` had no `data:` URL guard | OBS / SEC-lite | HIGH | **Fixed** — beforeBreadcrumb now drops `data:` bodies and caps URLs at 200 ch |
| 2 | `InvalidPdf: response is not a PDF (server may have returned an error page)` on `nb-download:2` | 1 | `useLocalPdfSource.ts:319–322` — magic-number gate correctly fired; upstream `nb-download` bytes were an HTML page | DATA / UX | HIGH | **Already implemented** — magic-number check already ships. Symptom is a real content-source issue (the saved bytes are HTML), tracked separately as an offline-download resiliency ticket |
| 3 | `ResponseException: Unexpected server response (0) while retrieving PDF "nb-download:2"` | 1 | pdf.js was handed `nb-download:2` as a URL. `useLocalPdfSource.ts:323` already hands pdf.js an `ArrayBuffer`; check `FastPdfReader` fallback branch that passes `src` when `data` is null | RELY | HIGH | **UNMAPPED** — need to confirm which caller passed the raw URL (`FastPdfReader.tsx` src fallback is the likely culprit). Filed as follow-up. |
| 4 | `[downloadFile] Native blob fallback failed: Failed to fetch ()` | 1 | `src/utils/fileUtils.ts:296` — chained after a `nb-download:` URL reached the web-fetch fallback | RELY | MEDIUM | Filed follow-up: skip fetch fallback for non-http schemes; convert `console.error` → `reportError({ surface: "downloadFile" })`. |
| 5 | `[unhandledrejection] TypeError: Failed to fetch` reported 3× (`sentry.event` + `console.error` forwarder + native handler) | 3 | Sentry `beforeSend` had no dedupe | OBS | MEDIUM | **Fixed** — `beforeSend` now drops duplicates of `type\|value\|top-frame` inside a 5 s window |
| 6 | Eruda frames (`eruda-BsRSCb87.js`) polluting stack fingerprints | many | Admin devtool wraps `window.fetch`; frames leak into every Sentry event | OBS | LOW | **Fixed** — `beforeSend` strips `eruda-*.js` and `vendor-sentry-*.js` frames before scrubbing |
| 7 | `POST rest/v1/rpc/get_dashboard_snapshot` `status_code:0` (network drop) | 1 | Called from dashboard hook; no retry/reportError conversion visible | RELY | LOW | Filed follow-up: wrap in react-query retry + `reportError({ surface: "dashboardSnapshot" })` |

## 2. Breadcrumb-only warnings (not raised as Sentry issues)

| Pattern | Count | Actionable? |
| ------- | ----- | ----------- |
| 126 `http fetch` status 200 | 126 | No — normal traffic. |
| 1 fetch to `data:application/pdf;base64,…` | 1 | Fix landed in #1. |

## 3. Fix plan

### P1 — landed in this PR
- **#1** `src/lib/sentry.ts` `beforeBreadcrumb`: drop `data:` URL payloads (replaced with `data:[dropped Nb]`); cap all other URLs at 200 chars.
- **#5** `src/lib/sentry.ts` `beforeSend`: 5 s dedupe on `exception.type|value|topFrame.filename|topFrame.function`.
- **#6** `src/lib/sentry.ts` `beforeSend`: `stripNoisyFrames()` removes `eruda-*.js` and `vendor-sentry-*.js` frames before PII scrub.

### P2 — follow-up ticket
- **#3** Confirm `FastPdfReader.tsx` never renders when the resolved state is a virtual-scheme URL (`nb-download:`, `web-indexeddb:`, `nb-personal-library:`). Guard: if `src` matches `LOCAL_RE` and `data == null`, render error state instead of forwarding to pdf.js.
- **#4** `src/utils/fileUtils.ts:288–299`: refuse `fetch()` fallback when the URL scheme is not `http(s)`; convert `console.error` → `reportError({ surface: "downloadFile", url })`.

### P3 — backlog
- **#7** Wrap `rpc/get_dashboard_snapshot` invocation in a react-query mutation with 2× exponential retry; on final failure call `reportError({ surface: "dashboardSnapshot" })` so we can distinguish flaky-network from real backend errors.
- **CI regression guard** — extend `e2e/*.spec.ts` to assert no `pageerror` fires when opening a lesson PDF and no `data:` URL appears in a Sentry breadcrumb payload (uses a mocked Sentry transport). Split into its own PR.

## 4. Wins (what the codebase already does right)

- **Magic-number gate** at `useLocalPdfSource.ts:314–322` — HTML-masquerading-as-PDF is caught before pdf.js allocates buffers.
- **ArrayBuffer contract** — pdf.js receives `Uint8Array` `data`, never a custom-scheme URL (line 323).
- **PII scrubbing** — `PII_PATTERNS` covers email/phone/JWT/Bearer already; the new `data:`-URL guard closes the last common leak class.
- **Console-forwarder re-entry guard** — `forwarderInFlight` prevents infinite recursion even when captureException itself fails.
- **Redacted URLs** — `redactUrl()` used consistently at breadcrumb sites in `useLocalPdfSource.ts`.

## 5. Debugging-capacitor probes to run when reproducing #3

1. `adb logcat -s NbPdfPlugin:V Capacitor:V CapacitorConsole:V | rg 'readFile|nb-download'`
2. Chrome DevTools breakpoint in `useLocalPdfSource.ts` line 323 to confirm handoff shape.
3. `?debug=1` overlay on `/downloads` to catch the second-open case without a laptop tether.

## 6. Open questions (for team)

1. Should we expire old Sentry events that contain the base64 body from before fix #1 ships, or wait for retention rollover?
2. Is Eruda intentionally loaded for admin devices in prod, or should it be dev-only? (Answer decides whether #6 is "enough" or whether we should drop Eruda from prod entirely.)
3. Is the correct product behaviour on issue #2 (`nb-download` returning HTML bytes) to auto-delete + re-download, or surface a "corrupted, tap to redownload" UI? Waiting for product call before shipping the P2 fix.

---

Used the sentry-triage, console-error-triage, senior-architect-audit, and debugging-capacitor skills.
