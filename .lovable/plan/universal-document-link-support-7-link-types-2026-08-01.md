# Universal Document Link Support (7 link types)

Goal: every link type below opens **inside the app** (no "web page, not a PDF", no "Invalid PDF structure", no "Supabase client not configured"), on web and in the APK.

| # | Link type | Today | After |
|---|---|---|---|
| 1 | jsDelivr GitHub PDF (path has spaces) | "Invalid PDF structure" | Streams via pdf-proxy with encoded path + real error text when upstream is HTML/404 |
| 2 | Telegram storage `/view/<id>` | "Supabase client not configured" | Opens via `resolve-storage-pdf` using the shared Supabase client config |
| 3 | Notion (`app.notion.com/p/...`) | Falls to generic web-page card | Rendered by the existing Notion page renderer, else "Open in Notion" card |
| 4 | Google Drive `/file/d/<id>/view` | Works (proxied pdf.js) | Unchanged, re-verified |
| 5 | Google Docs `/edit` | "This attachment is a web page, not a PDF." | Auto-converted to `/export?format=pdf` and streamed through pdf-proxy |
| 6 | Google Sheets `/edit` | Same web-page block | Same export→PDF path (landscape export) |
| 7 | archive.org `/details/<id>` | Unsupported | Resolved to the item's PDF file and streamed through pdf-proxy |

## What will change

### 1. Link classification (`src/lib/pdfViewerUrl.ts`, `src/lib/detectFileType.ts`)
- Add `googleExportPdfUrl()` for Docs/Sheets/Slides → `/export?format=pdf` (+ `portrait=false&size=A4` for Sheets), routed through `pdf-proxy?kind=url`.
- `resolveEmbedUrl` returns the proxied export URL for Docs/Sheets instead of the `/preview` iframe (preview iframes are blocked in Android WebView and in Firefox mobile).
- `isKnownNonPdfWebUrl` stops flagging Docs/Sheets **document** URLs (folders, search, my-drive stay flagged), so LessonView/attachments no longer bounce them to the browser.
- Add `isArchiveOrg()` + `archiveOrgPdfUrl()`: `archive.org/details/<id>` → proxy resolves the item's PDF via the archive metadata API.
- Normalize spaces/parentheses in remote paths before proxying (fixes link #1).

### 2. `pdf-proxy` edge function
- Allow `archive.org` and `*.archive.org` (`ia*.us.archive.org` download hosts) in `ALLOWED_HOSTS`; keep the existing SSRF guards (https-only, no IP literals, per-redirect re-validation).
- Add a `kind=archive` branch: fetch `https://archive.org/metadata/<id>`, pick the first `.pdf` file, stream it.
- Keep Google Docs restricted to the export path (already enforced) and extend the regex to accept `/export?format=pdf` with query.
- Return a typed JSON error (`{ code: "not_pdf", contentType, status }`) when upstream returns HTML instead of PDF bytes, so the reader can show the real reason instead of "Invalid PDF structure".

### 3. Reader error surface (`src/lib/pdfErrorMessage.ts`, `useLocalPdfSource.ts`)
- Map the new `not_pdf` / 404 / 403 proxy codes to specific Hindi+English messages naming the host and status, with "Open in browser" as fallback.

### 4. Telegram storage fix (`src/lib/native/naveenStoragePdf.ts`)
- Stop reading `import.meta.env` directly; use the same constants the shared Supabase client uses, and fall back to the project URL/anon key already compiled into the client. Removes the "Supabase client not configured" dead end and surfaces auth/entitlement errors properly.

### 5. Notion
- Confirm `app.notion.com/p/<slug-id>` extracts the page id and reaches `notion-page`; if the proxy 4xxs, show the "Open in Notion" card instead of the generic non-PDF message.

### 6. Tests
- Extend `src/test/pdf-sources.test.ts` with all 7 URLs from the request: classification, proxy routing, and export-URL shape.
- Add proxy allowlist unit tests for archive.org + Docs export, plus SSRF negatives (IP literals, http, non-export docs paths).

## Verification (after the code changes)
- Run vitest + typecheck.
- `curl` the deployed `pdf-proxy` for each of the 6 remote links and assert `content-type: application/pdf` and a `%PDF` prefix.
- Log into the preview with the supplied test account in a headless browser at 390px, open one lesson per link type, and screenshot the reader for each.

## Security notes (red-team lens)
- No open proxy: archive.org and Docs stay path/host restricted; redirect hops keep re-validating.
- Docs/Sheets export only works for links the owner already shared publicly — no credential is attached to the upstream fetch.
- Bandwidth: proxy responses keep `Range` support and `Cache-Control: public, max-age=31536000, immutable` for versioned/immutable sources so repeat opens don't re-egress.

## Out of scope
Admin upload UI redesign, video links, and any change to enrollment/payment logic.
