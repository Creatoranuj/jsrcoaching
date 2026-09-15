# Fix: Google Sheets PDFs render tiny with huge blank space

## Problem
Google Sheets "export to PDF" pages are full A4/letter sheets where the actual table occupies only a small block in the top-left corner. The reader fits the *paper* to the screen, so on mobile the table shrinks to ~30% of the width and the rest of the page (plus a trailing near-empty page) is blank white — exactly what the screenshot shows.

This is a presentation problem only: the file itself loads fine. Nothing about proxying, auth, or the loader changes.

## Approach: content-aware fit (smart crop)
Instead of fitting the paper, fit the *ink*.

1. For each page, measure the bounding box of real content (text runs + images/graphics).
2. If the content box is meaningfully smaller than the page (e.g. covers < ~75% of width or height), render that page zoomed so the content box fills the reader width, and clip away the empty margins.
3. If a page has no content at all (the trailing blank sheet), collapse it instead of showing a full blank page.
4. If the content already fills the page (normal lecture PDFs, Telegram/Drive/GitHub notes), behave exactly as today — no visual change, no regression.

The user's pinch-zoom, double-tap zoom, autoscroll, and lazy page mounting all keep working; smart-fit only changes the base scale and the visible crop rectangle for sparse pages.

## Safety / guardrails
- Measurement runs once per page, cached per document; only for pages already being mounted, so memory and lazy-render behaviour stay flat (no full-document pre-scan on 100+ page files).
- Falls back silently to current behaviour if measurement fails or returns nonsense.
- Cropping is capped (max ~3x zoom) so a page with one stray character does not blow up to unreadable magnification.
- Placeholder heights stay consistent so scroll position and autoscroll don't jump.

## Technical detail
- New pure helper `src/lib/pdfContentBox.ts`
  - `measureContentBox(page)` — uses pdf.js `getTextContent()` transforms plus `getOperatorList()` image/fill ops to union a bbox in PDF user space, normalised against `getViewport({ scale: 1 })`.
  - `fitToContent(box, pageSize, containerWidth)` — pure function returning `{ renderWidth, offsetX, offsetY, cropWidth, cropHeight, blank }`, with the <75% coverage threshold, 3x zoom cap, and small padding margin. Unit-testable without pdf.js.
- `src/components/video/FastPdfReader.tsx`
  - `LazyPage` gains an optional fit descriptor: renders `<Page width={renderWidth}>` inside an `overflow-hidden` wrapper sized to the crop rect with a negative `translate` offset.
  - A per-document `Map<pageNumber, fit>` is populated on page load callback; blank pages render as a thin divider instead of a full sheet.
  - Existing `computeFitPageWidth` stays the base for full-bleed pages.
- Tests: `src/test/pdfContentBox.test.ts` covering full-page content (no crop), sparse top-left content (crop + zoom, matching the Sheets case), empty page (blank), and the zoom cap.
- Verification: `bunx vitest run` for the new + existing PDF suites, then an authenticated mobile-viewport browser pass on the Knowledge Hub Google Sheets lesson to confirm the table fills the width and the blank page is gone.
