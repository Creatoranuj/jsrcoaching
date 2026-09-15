# Archive PDF stability and footer repair

## Confirmed diagnosis

- The Knowledge Hub lesson **“PDF BY ARCHIVES”** points to `https://archive.org/details/Botany_Nites_Neet_2024`.
- Archive metadata contains a **1.43 GB image PDF** and a **312 MB text-only derivative**. The proxy correctly selects the image PDF because the smaller derivative can render blank pages.
- The 1.43 GB PDF is **not linearized**; PDF.js must fetch its tail cross-reference plus page objects through sparse range requests before rendering.
- The thin blue bar uses sparse downloaded bytes as if they were whole-file progress. It can therefore stop at an arbitrary milestone even while PDF.js is still resolving objects.
- `LazyPage` mounts canvases when they enter the viewport but never releases distant canvases. During Archive autoscroll, rendered canvases accumulate and can exhaust Android WebView memory.
- Both footer image URLs currently return **404**. The footer also shows a WhatsApp-style icon where the requested social pair is YouTube + Telegram.

## Changes

1. **Make Archive loading truthful and recoverable**
   - Keep the Archive-only range path and never download the 1.43 GB file into one `Uint8Array`.
   - Replace byte-derived Archive progress with explicit phases: connecting, reading document index, preparing first page, ready.
   - Remove the duplicate/stuck thin in-reader bar for Archive only; retain the existing behavior for every other PDF source.
   - Reset progress state cleanly on bounded retry and surface a useful retry error if Archive remains unavailable.

2. **Prevent autoscroll crashes on large Archive PDFs**
   - Virtualize Archive page canvases: keep nearby pages rendered and release canvases far behind/ahead while preserving placeholder height and scroll position.
   - Pause autoscroll while the next page is not ready instead of racing through placeholders.
   - Keep existing Google Drive, Sheets, Telegram, Notion, and normal-PDF behavior untouched.

3. **Repair the landing footer**
   - Replace the two dead asset-pointer images with bundled Lucide YouTube and Telegram-style icons.
   - Link YouTube to the existing configured Sadguru channel and retain the existing Telegram channel URL.
   - Preserve the footer layout, spacing, colors, and all unrelated content.

4. **Verification**
   - Add focused tests for Archive source progress semantics and canvas windowing.
   - Test Archive range responses against the real Botany item (header, tail/xref, and page-object requests).
   - Run browser checks at mobile width for: first page render, one progress indicator, retry behavior, sustained autoscroll without increasing canvas count, and working footer links/icons.
   - Re-check non-Archive PDFs to confirm their loading rules are unchanged.

## Technical scope

- Frontend: `FastPdfReader`, `useAutoScroll`, and landing `Footer`.
- Backend only if the range test proves necessary: Archive branch of `pdf-proxy`; no other proxy source branches will change.
- Authenticated end-to-end browser login cannot be restored through the sandbox because this project reports external/unmanaged auth. Verification will use source/database inspection, direct Archive range checks, edge-function tests, and all accessible browser routes without exposing or storing credentials.