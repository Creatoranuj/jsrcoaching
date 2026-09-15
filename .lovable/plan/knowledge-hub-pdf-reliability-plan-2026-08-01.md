# Knowledge Hub PDF Reliability Plan

## Verified current state

- Knowledge Hub is course `15` with seven document lessons spanning Drive, Google Sheets, Notion, Telegram-backed storage, jsDelivr/GitHub CDN, and Archive.org.
- These lesson links are stored in `lessons.video_url`, but the existing **PDF Source Health** loader only reads `class_pdf_url` and `lesson_pdfs`. Its “all healthy” result therefore does not audit the actual Knowledge Hub lesson links.
- The reader validates `%PDF-` only on materialized/local paths. Normal proxied remote URLs can go directly to pdf.js, where a `200` HTML/JSON/error body or truncated stream becomes the misleading raw error **“Invalid PDF structure.”**
- `pdf-proxy` rejects explicit HTML content types, but does not verify the PDF byte signature when an upstream labels bad content as `application/octet-stream` or another non-HTML type.
- Protected lesson content currently uses the low-level protection hooks directly instead of the existing shared protected-surface scaffold.

## Implementation

### 1. Make the audit cover every real Knowledge Hub document

- Update the admin health loader to include `lessons.video_url` whenever `lecture_type` is `PDF`, `DPP`, `DPP_ATTEMPT`, or `NOTES`, while retaining `class_pdf_url`, `lesson_pdfs`, and attachments.
- Deduplicate identical URLs and show lesson title, source family, database field, HTTP status, content type, PDF signature, response time, and exact failure reason.
- Keep probes lightweight: request only the first 1 KB, limit concurrency to six, and give each probe its own timeout so one slow Archive.org/Drive response does not cancel the entire batch.
- Treat Notion separately: validate its `recordMap` response rather than expecting `%PDF-` bytes.

### 2. Stop invalid upstream bytes before pdf.js

- Add a reusable streaming-safe response validator in `pdf-proxy`:
  - For full responses and ranges beginning at byte `0`, peek only the header bytes and require `%PDF-`.
  - Reassemble the peeked bytes with the untouched stream so large files remain streamed and are never fully buffered.
  - Return a typed `415` JSON response (`code: not_pdf`) when the response is HTML, JSON, empty, or lacks a PDF signature.
- Apply the validator to generic URL, Archive.org, and Drive cache-miss paths; preserve `Range`, `Content-Range`, `ETag`, and cache headers.
- Add stable typed error codes for unauthorized, forbidden, private Drive file, timeout, truncated stream, non-PDF response, and upstream failure.
- Keep the existing SSRF allowlist and enrollment checks unchanged.

### 3. Harden the reader and authentication race

- Ensure authenticated proxy URLs are not created before the Supabase session has resolved; retry once with a freshly resolved session when a proxy responds `401`.
- In `FastPdfReader`/shared PDF error mapping, explicitly translate `InvalidPDFException`, “Invalid PDF structure,” `not_pdf`, and truncated-stream failures into clear student-facing messages instead of exposing pdf.js internals.
- Rebuild the source URL on Retry so refreshed auth and corrected signed/proxy URLs are used.
- Keep whole-file fallback as a last resort only; do not use it for the normal path or for very large Archive.org PDFs.

### 4. Apply protected-surface safety consistently

- Migrate `LessonView` from direct `useScreenProtection`/web-shield calls and its duplicate mount ref to `useProtectedSurface`.
- Extend the shared protected-surface hook to compose both native and web protection while preserving fail-safe role loading and the per-device admin bypass.
- Wrap immersive document routes with `SafeBoundary` and a layout-matching skeleton rather than a full-page spinner; preserve the existing back-button escape path.
- Guard all asynchronous reader state updates with the shared mount ref or `AbortController`.

### 5. Regression coverage and authenticated verification

- Add tests for source classification, Knowledge Hub `video_url` discovery, Notion routing, token/session readiness, typed error mapping, and `%PDF-` stream validation.
- Add Edge Function tests for valid PDF bytes, `200` HTML disguised as octet-stream, JSON errors, byte ranges, unauthorized requests, and interrupted upstream streams.
- Run the admin audit against course `15`, then open every lesson through the same in-app `DocumentReader` path used by students.
- Record one row per lesson in the audit report: source, cold/warm open time, first-page result, range support, failure cause, and fix status.
- Acceptance criteria:
  - All seven Knowledge Hub lessons open in-app.
  - No raw “Invalid PDF structure” message reaches students.
  - Warm open is under 1 second and cold open under 3 seconds where the upstream supports it; unusually large Archive.org files are reported separately.
  - Only visible pages render, PDF streaming remains enabled, no service worker is introduced, and protected screens remain protected during role resolution.

## Technical files in scope

- `src/hooks/usePdfSourceHealth.ts`
- `src/pages/AdminPdfHealth.tsx`
- `src/lib/pdfViewerUrl.ts`
- `src/lib/pdfErrorMessage.ts`
- `src/components/video/FastPdfReader.tsx`
- `src/pages/LessonView.tsx`
- `src/lib/safety/useProtectedSurface.ts`
- `supabase/functions/pdf-proxy/index.ts`
- Focused frontend and Edge Function test files
- `docs/AUDIT-2026-08-01-knowledge-hub-pdfs.md`

## Constraints

- No database schema change is required.
- Do not expose or persist account credentials.
- Do not remove enrollment authorization, screen protection, in-app viewing, range streaming, or visible-page-only rendering.
- The connected external Supabase session cannot be injected into the sandbox browser, so the final authenticated lesson-by-lesson run must use an available live browser session; all public upstream and server-level checks remain automatable.