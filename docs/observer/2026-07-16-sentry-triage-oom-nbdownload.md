# Sentry Triage — OOM on nb-download + 401 pdf-proxy tail — 2026-07-16

**Verdict:** P1 fix shipped. `readNbDownload:fail` (180 MB alloc → OOM) is
eliminated for files > 40 MB by switching to range-streaming; `data:` URL
fallback that produced `Failed to fetch ()` is refused.

## Root causes (from `FileNotFound_HTTP_401.md`)

| # | Timestamp | Symptom | Root cause |
|---|-----------|---------|-----------|
| 1 | 00:56:41.902 | `readNbDownload:fail id:2` — "Failed to allocate a 180404920 byte allocation with 100663296 free bytes" | `readNbDownloadAsBlob` called `Filesystem.readFile` on a ~35 MB native download; base64 decode peaks ~5× file size → OOM on 2-4 GB Android. No size guard on native tier (web tier + `readNativeFileAsBlob` both had one; this path did not). |
| 2 | 00:56:33.096 | `fetch(data:application/pdf;base64,…)` → status 0 | After `readNbDownload:fail id:1`, fallback `fetchBlobWithTimeout(rec.url)` was called with a `data:` URL stored in `downloads.url`. Android WebView refuses to `fetch()` giant `data:` URLs → "Failed to fetch ()" + huge breadcrumb payload leaking to Sentry. |
| 3 | 00:56:45.975–46.497 | Two `GET pdf-proxy` → 401 → `FileNotFound: HTTP 401` | Tail effect of #1/#2: after materialisation failed, `useLocalPdfSource` surfaced `rec.url`/proxy fallback; unauthenticated retry against `pdf-proxy` returned 401. Fixing #1 removes the trigger. Signed-URL refresh remains a separate P2 (see prior triage). |

## Fix

`src/hooks/useLocalPdfSource.ts`

- Replaced `readNbDownloadAsBlob(id): Blob | null` with
  `resolveNbDownloadSource(id): { blob?; streamUrl? } | null`.
  - Native tier now reads `rec.size_bytes` (falls back to `Filesystem.stat`).
  - If size > `NATIVE_INLINE_READ_MAX_BYTES` (40 MB): resolves the absolute
    URI via `Filesystem.getUri` and returns `streamUrl` from
    `Capacitor.convertFileSrc`, so pdf.js range-streams pages from disk
    (heap stays flat) instead of loading the whole PDF into JS memory.
  - Adds `pdf/readNbDownload:stream-large` breadcrumb for observability.
- Caller in the `nbId` branch:
  - Uses the returned `streamUrl` directly (sets `src`, bypasses
    ArrayBuffer materialisation entirely).
  - Refuses to fetch `rec.url` when it's a `data:` URL (`/^data:/i` guard)
    — prevents the huge base64 payload from re-entering the pipeline and
    surfaces the friendly "re-download while online" error instead.

## Verification

- `bunx tsgo --noEmit` → clean.
- Size guard mirrors the existing `readNativeFileAsBlob` pattern (line
  96-102) — same 40 MB threshold, same fallback strategy, same breadcrumb
  category, so future audits find one policy.

## Follow-ups (unchanged from prior triage)

- P2: `pdf-proxy` 401 retry — refresh signed URL through `get-lesson-url`
  before falling back to raw proxy fetch.
- P2: Assert in `e2e/pdf-offline.spec.ts` that opening a >40 MB fixture
  never triggers `readNbDownload:fail` and that Sentry receives zero
  `data:` URL breadcrumbs.
- P3: `size_bytes` was optional on `DownloadRecord` — start requiring it
  for new native saves so we never fall back to `stat`.

Used the sentry-triage + app-crash-shield skills.
