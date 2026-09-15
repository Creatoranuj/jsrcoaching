# Fix Telegram + Google Sheets PDFs, Notion autoscroll, AI key rotation

## What I verified before writing this

- Google Sheets export for your sheet is healthy upstream: `.../export?format=pdf&portrait=false` returns `307` to `googleusercontent...` then `200 application/pdf`. The sheet is fine; the failure is inside our app path.
- The Telegram viewer link returns `200 text/html` (a SPA page), so it must go through `resolve-storage-pdf`; when that resolve fails the reader shows "did not return a valid PDF file".
- Classifiers are already correct: `src/lib/detectFileType.ts:36-38` excludes Docs/Sheets/Slides from "web page", and `src/lib/pdfViewerUrl.ts:228-236` builds the export URL.
- The "This attachment is a web page, not a PDF." screen is `src/components/video/FastPdfReader.tsx:704-717`; it fires on the resolved `src`, not the original link.
- `NotionPageRenderer` has its own scroll container (`src/components/video/NotionPageRenderer.tsx:307`) but no autoscroll wiring — `useAutoScroll` and `AutoScrollFab` exist and are used only by the PDF readers.

The root cause for Sheets/Telegram is **not yet confirmed at runtime**: the sandbox has no signed-in session and a direct `pdf-proxy` call returns `401 Unauthorized`. So step 1 is a live signed-in reproduction, not a blind patch.

## Plan

### 1. Live reproduction with your account (first step)
Sign in as `Mahimaacademe@gmail.com` in a headless browser, open the Knowledge Hub course, and open each PDF lesson while capturing network + console. This gives the exact failing request (status, error code, content-type) for the Telegram and Sheets lessons instead of a guess.

### 2. Fix Google Sheets
Candidates, decided by the trace:
- the lesson URL is stored in a shape that skips `googleExportPdfUrl()` and reaches the reader raw, or
- `pdf-proxy` blocks the redirect target, since its Google export path only allow-lists `/export` on `docs.google.com` (`supabase/functions/pdf-proxy/index.ts:594-598`).

Fix accordingly: route every Docs/Sheets/Slides link through the export proxy at resolve time, and let `pdf-proxy` follow the Google export redirect to `*.googleusercontent.com` while keeping the allow-list tight (no open proxy).

### 3. Fix Telegram (storage viewer) PDFs
Make `resolve-storage-pdf` surface the real upstream reason (`404 asset_missing`, `401 storage_key_rejected`, `415 not_pdf`) and have the reader retry the authenticated resolve once before erroring, so a stale token doesn't look like a broken file. Verify end-to-end on the actual lesson.

### 4. Notion autoscroll
Wire `useAutoScroll` to the Notion scroll container and render the existing `AutoScrollFab` — same speed steps, 44px tap target, safe-area padding as the PDF reader, `prefers-reduced-motion` respected, interval cleared on unmount.

### 5. Rotate AI key + verify Ask Doubt
Rotate `LOVABLE_API_KEY`, redeploy the AI functions so they pick up the new secret, then verify `ai-health`, the Sadguru Agent chat and Ask Doubt with real signed-in requests, and report the actual responses.

### 6. Support report
A table of every PDF source type (jsDelivr/GitHub CDN, Telegram storage, Notion, Drive, Docs, Sheets, Archive.org, Supabase storage, direct PDF): supported yes/no, how it renders, and the live result for your course.

## Technical notes
- Only presentation + resolve/proxy layers change; no schema changes, no change to `FastPdfReader` streaming flags (`disableAutoFetch:false`, `disableStream:false`), splash timeout, or the single back-button handler.
- Any new proxy hop keeps `%PDF-` signature sniffing so an HTML error page can never reach pdf.js again.
- Verification: signed-in Playwright run per source plus `bunx vitest run` green.

## What I need from you
Nothing further — the login you gave is enough, and the password will not be stored anywhere.