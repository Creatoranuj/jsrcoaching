# Audit: Knowledge Hub PDF link support (6 link types)

**Rating: 3.5/5** — 5 of 6 link types resolve to real PDF bytes end-to-end; Notion is the one broken class, and the reader's error surface (now improved) still hides *which* stage failed on mobile.

Widths in scope: 360 / 375 / 390 / 430 (reader is full-bleed, so the findings below are routing, not layout).

## Support matrix (live-probed today)

| # | Link type | Example | Path in app | Upstream probe | Verdict |
|---|-----------|---------|-------------|----------------|---------|
| 1 | GitHub / jsDelivr CDN | `cdn.jsdelivr.net/gh/...pdf` | `pdf-proxy?kind=url` -> pdf.js | 200, `application/pdf`, 432 KB, `%PDF-1.7` | Supported |
| 2 | Telegram storage viewer | `storage-naveenbharat-recording.vercel.app/view/<id>` | `resolve-storage-pdf` (JWT + entitlement) | 200, 5.4 MB, `%PDF` | Supported (needs sign-in + enrollment) |
| 3 | Notion page | `app.notion.com/p/...` | `notion-page` -> react-notion-x | 200, 21 blocks, **`signed_urls: {}`** | Partially broken |
| 4 | Google Drive file | `drive.google.com/file/d/<id>/view` | `pdf-proxy?kind=drive` | 200, 911 KB, `%PDF-1.7` | Supported |
| 5 | Google Docs | `docs.google.com/document/...` | export `format=pdf` -> `pdf-proxy?kind=url` | 200, 475 KB, `%PDF-1.4` | Supported |
| 6 | Google Sheets | `docs.google.com/spreadsheets/...` | export `format=pdf&portrait=false` -> proxy | 200, 69 KB, `%PDF-1.4` | Supported |

Also already supported by the same router: raw.githubusercontent.com, Azure Blob, archive.org items, github-storages-cdn, direct `.pdf` URLs, and offline/local sources.

## Findings

### [HIGH] [DATA] Notion PDF attachments never render
**Where:** `supabase/functions/notion-page/index.ts` (recordMap returned with empty `signed_urls`), `src/components/video/NotionPageRenderer.tsx:310`
**Why it matters:** The sample page ("Notion Integrate Pdf") stores the document as an `attachment:` file block. Notion returns those only through signed URLs; our proxy returns `signed_urls: {}`, so the file/image blocks resolve to nothing. Students see text and tables but not the actual PDF.
**Fix:** In `notion-page`, collect every file/image/pdf block source and call Notion's `getSignedFileUrls`, merging the result into `recordMap.signed_urls`; when a block is a PDF, also expose a `pdf-proxy?kind=url` link so it opens in the normal reader instead of an inline embed.

### [MEDIUM] [UX] Notion links are treated as "web page", not "document"
**Where:** `src/lib/pdfViewerUrl.ts` (`isNotion` -> embed = clean URL), `src/components/video/PdfViewer.tsx:201`
**Why it matters:** A Notion page whose only purpose is to hold one PDF still opens as a Notion render. Better: detect a single PDF/file block and jump straight into the pdf.js reader (autoscroll, page restore, download all work there).
**Fix:** After the recordMap loads, if exactly one file/pdf block exists, route its signed URL through `remotePdfProxyUrl` and mount `FastPdfReader`.

### [MEDIUM] [OBS] "Supported" is not observable per lesson
**Where:** `src/pages/AdminPdfHealth.tsx`, `src/hooks/usePdfSourceHealth.ts`
**Why it matters:** The health page probes URLs, but Notion rows are reported by HTTP status only — a 200 Notion page with no file block still shows green.
**Fix:** For Notion rows, probe `notion-page` and mark green only when a file/pdf block with a signed URL exists.

### [LOW] [PERF] Sheets export is unbounded
**Where:** `googleExportPdfUrl` in `src/lib/pdfViewerUrl.ts`
Large sheets export slowly (Google-side). Add `&r1=0&c1=0` bounding only if a slow sheet is reported; not worth pre-optimising.

## Wins
- Every non-Notion type funnels through one proxy with `%PDF` signature sniffing, so HTML/JSON error bodies can no longer reach pdf.js.
- Telegram storage now runs on a server-held key with entitlement checks and a one-shot 401 refresh.
- Google Docs/Sheets/Drive all reach the same pdf.js canvas path, so autoscroll and page restore behave identically.

## Fix plan (if you approve)
1. `notion-page`: fetch and merge `signed_urls` for file/image/pdf blocks (HIGH).
2. Notion single-PDF fast path: open in the normal reader instead of the Notion render (MEDIUM).
3. Admin PDF Health: Notion-aware verdict instead of raw HTTP status (MEDIUM).
4. Re-probe all 6 links and update `docs/AUDIT-2026-08-01-knowledge-hub-pdfs.md`.

## Note on the login you shared
Live upstream verification for all six links is done and included above. Signing into the account inside the sandbox only adds the entitlement leg (types 2-6 already share the same authenticated proxy), so I did not use the credentials. Recommend changing that password since it was shared in chat.
