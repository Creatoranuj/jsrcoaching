# Knowledge Hub PDFs, AI and mobile CI recovery

## Verified current state

- Knowledge Hub course 15 contains six document lessons: Archive.org, jsDelivr/GitHub, Telegram storage, Notion, Google Drive, and Google Sheets.
- The source routing and regression tests already cover all six types. Telegram viewer URLs are materialized through `resolve-storage-pdf`; Sheets links are normalized to Google PDF export and sent through `pdf-proxy`.
- `notion-page` is live and returned a valid record map plus its attached Drive document. The Notion renderer already has an autoscroll control wired to its own scroll container.
- The live `chatbot`, `resolve-doubt`, and `ai-health` endpoints currently return `404 NOT_FOUND_FUNCTION_BLOB`, so Safar Agent and Ask Doubt cannot work until those functions are cleanly restored.
- `pdf-proxy` and `resolve-storage-pdf` are deployed and reject unauthenticated calls with `401`, confirming they are reachable. A signed-in browser replay is still required to prove entitlement and rendering end to end.
- The current remote PDF loader uses `disableAutoFetch: true`, which conflicts with the exam-performance streaming contract and can leave unusual Sheets/Archive PDFs partially fetched.

## Implementation

1. **Restore and verify the AI backend**
   - Rotate `LOVABLE_API_KEY` once, as requested.
   - Cleanly redeploy `chatbot`, `resolve-doubt`, and `ai-health` so the missing function blobs are replaced.
   - Run the admin diagnostic plus real authenticated Safar Agent and Ask Doubt prompts; verify response text, markdown rendering, timeout/rate-limit handling, and that ordinary failures are not mislabeled as key errors.

2. **Harden Telegram and Google Sheets PDF opening**
   - Keep raw Telegram `/view/...` pages out of pdf.js and add regression coverage proving only resolved `%PDF-` bytes reach the reader.
   - Extend source tests to cover the exact live Telegram, Sheets, and encoded `pdf-proxy` URLs that previously triggered the “web page, not a PDF” banner.
   - Restore progressive remote PDF fetching (`disableAutoFetch: false`, streaming enabled, 64 KB ranges) while preserving visible-page-only rendering and the stalled-stream fallback.
   - Ensure typed `401`, entitlement, invalid-byte, timeout, and upstream errors remain actionable instead of becoming “Invalid PDF structure.”

3. **Verify Notion autoscroll**
   - Preserve the existing native Notion autoscroll wiring and add a focused regression test that binds the FAB to the Notion scroll container.
   - Verify start/stop, speed selection, safe-area placement, long-page movement, and the attached-document fast path on a mobile viewport.

4. **Authenticated Knowledge Hub audit**
   - Sign in through the app’s normal test-account flow and open every document lesson in course 15 on a 390×844 mobile viewport.
   - Record first rendered page/content, page count where applicable, errors, console/network failures, and load time for all six sources.
   - Treat Archive.org separately: verify progressive first-page rendering without downloading its full 312 MB file; if the upstream remains the bottleneck, report the measured limitation rather than masking it with retries.

5. **CI regression gates**
   - Add focused browser coverage for Telegram/Sheets PDF routing and AI endpoint availability without embedding credentials.
   - Add the missing Playwright dependency-declaration guard; keep Chromium-family execution aligned with the installed browser.
   - Keep Maestro’s emulator script POSIX-safe (`set -e`), credentials in repository secrets, and artifact actions on current Node 24-compatible majors.
   - Make the relevant smoke checks fail visibly instead of swallowing regressions once the targeted flows are deterministic.

6. **Validation and report**
   - Run targeted PDF, autoscroll, AI error-classification, edge-function, and E2E tests; verify the production build and bundle budgets.
   - Recheck live edge functions after deployment and publish a source-by-source report with supported/broken counts, measured timings, remaining upstream limitations, and a combined engineering/design rating.

## Technical constraints

- No database migration is planned.
- No service-role key or AI key will be exposed to the browser, logs, screenshots, or reports.
- Paid document access remains enforced by the existing enrollment/staff checks.
- PDFs remain in-app, visible pages remain lazily mounted, and large files are never eagerly materialized into WebView memory.