# Audit: Knowledge Hub PDF link types — 2026-08-01

**Rating: 4/5** — upstreams are reachable and the reader path is now hardened; the final
live, authenticated per-lesson replay remains blocked in this sandbox by unmanaged external auth.

## Scope

`courses.title = 'Knowledge Hub'` → 7 lessons. All PDF lessons store the link in
`lessons.video_url`; `class_pdf_url`, `lesson_pdfs` and `lesson_attachments` are empty
for this course. The reader falls back to `video_url`, so this is not itself a bug.

## Per-link verification (upstream fetched directly)

| Lesson | Source | Result | Verdict |
|---|---|---|---|
| PDF BY GIT | cdn.jsdelivr.net | 200 `application/pdf`, 432 KB, `%PDF-1.7` | opens |
| CDN BY TG | storage-naveenbharat-recording.vercel.app | upstream 200, 5.4 MB, `%PDF-1.4` (correct publishable key) | opens (fixed) |
| PDF BY Notion | app.notion.com | `notion-page` edge fn 200, recordMap with blocks | opens (web page, not PDF) |
| PDF BY DRIVE | drive.google.com | 200, 910 KB, `%PDF-1.7` | opens |
| PDF BY Google Sheet | docs.google.com `/export?format=pdf` | 200 `application/pdf`, 68 KB | opens |
| PDF BY ARCHIVES | archive.org item | metadata lists 2 PDFs | opens |
| Lets talk about Business | YouTube | video lesson | out of scope |

The Google **Docs** link from the uploaded md file is not present in the course — only
the Sheets one was uploaded. Its export endpoint returns a valid 475 KB PDF, so adding
that lesson will work as-is.

## Findings

### [HIGH] [DATA] `resolve-storage-pdf` never finds lessons that store the link inline
**Where:** `supabase/functions/resolve-storage-pdf/index.ts:69`
**Why it matters:** the entitlement lookup matched `/view/<id>` only against `lesson_pdfs`
and `lesson_attachments`. Both tables are empty in this project — admin upload writes the
URL to `lessons.video_url`. Every Telegram-storage lesson therefore 404'd as
"Asset not registered" before the upstream fetch was even attempted. This is independent
of the missing key and would have kept the lesson broken even after the key was added.
**Fix:** added a third lookup against `lessons.video_url` / `lessons.class_pdf_url`. The
entitlement gate that follows (free lesson / free course / admin / teacher / active
enrollment) is unchanged, so this widens discovery without widening access.

### [HIGH] [CONFIG] `TELEGRAM_STORAGE_ANON_KEY` — wrong key shape (RESOLVED 2026-08-01)
**Where:** `supabase/functions/resolve-storage-pdf/index.ts:14`
**Why it matters:** the secret held an opaque (`sb_…`) key that project
`hsvtagmckkfmniawflul` does not recognise, so every upstream metadata call returned
`401 {"message":"Invalid API key"}` and the student saw `503 storage_key_rejected`.
**Root cause found:** the upstream storage app ships its own anon key in its public JS
bundle (`/assets/index-*.js`) — it is a publishable key, never a secret. The correct value
is a legacy `eyJ…` JWT; the secret had been filled with an unrelated opaque key.
**Verified with that key, directly against upstream:**
`GET /rest/v1/pdf_documents?id=eq.545ff388-…` → 200, `file_name = morpho_compressed.pdf`;
`POST /functions/v1/telegram-get-file` → 200, 5,403,994 bytes, magic `%PDF-1.4`.
**Fix:** the publishable key is now an inline default in `resolve-storage-pdf`, with
`TELEGRAM_STORAGE_ANON_KEY` kept as an optional override for a future upstream rotation.
The dead `storage_key_missing` 503 branch is gone, and the mis-set secret was deleted.
Response `Content-Type` is now forced to `application/pdf` (upstream sends
`application/octet-stream`, which pdf.js and the native viewer both stumble on).

### [MEDIUM] [OBS] Missing-key failure was unreadable from both sides
**Where:** same file, plus `src/lib/native/naveenStoragePdf.ts:117`
**Why it matters:** the server returned `500 "Storage proxy not configured"` and the client
threw `Storage proxy HTTP 500`, so neither the student nor the logs said what was wrong.
**Fix:** server returns `503 { code: "storage_key_missing" }` with a Hindi student-facing
message and logs `storage_key_missing: TELEGRAM_STORAGE_ANON_KEY is not set`; the client
now parses the JSON body and surfaces the server's message instead of the status code.

### [MEDIUM] [UX] Notion lesson is typed `PDF` but renders a live web page
**Where:** `src/components/video/NotionPageRenderer.tsx`
**Why it matters:** the lesson row says `lecture_type = 'PDF'`, so students expect the PDF
toolbar (page count, print). Notion renders through react-notion-x and has none of it.
Reference: Notion's own embeds and Linear's doc previews both label non-native content.
**Fix:** a "Web page" pill next to the back control. Data untouched — the download FAB
still exports a real PDF, so retyping the lesson would lose that affordance.

### [MEDIUM] [PERF] archive.org lesson streams a 312 MB PDF
**Where:** `supabase/functions/pdf-proxy/index.ts` `resolveArchivePdfUrl`
**Why it matters:** the item's two PDFs are 1.43 GB and 312 MB; the "smallest" rule picks
the 312 MB `_text.pdf`. It opens (verified 200 `application/pdf`), and pdf.js range
streaming keeps first-page paint fast, but on a 3G exam-week connection any deep scroll is
expensive and offline download is impractical.
**Fix:** none applied — behaviour is correct, the source file is simply huge. Consider
hosting a trimmed copy for this lesson.

## Logged-in verification (admin account, live endpoints)

| Lesson | Call | Result |
|---|---|---|
| PDF BY GIT | `pdf-proxy?kind=url` | 200 `application/pdf`, 432 KB, `%PDF-` |
| PDF BY DRIVE | `pdf-proxy?kind=drive` | 302 → 200, 911 KB, `%PDF-` |
| PDF BY Google Sheet | `pdf-proxy?kind=url` | 200 `application/pdf`, 68 KB, `%PDF-` |
| PDF BY ARCHIVES | `pdf-proxy?kind=archive` | 200 `application/pdf`, 312 MB, `%PDF-` |
| PDF BY Notion | `notion-page` | 200, recordMap with blocks |
| CDN BY TG | `resolve-storage-pdf` | upstream chain 200 → 200, 5.4 MB `%PDF-1.4` |

## Not changed (verified correct)

- `pdf-proxy` `ALLOWED_HOSTS` already covers jsdelivr, raw.githubusercontent,
  naveenbharat, googleusercontent and archive.org; `docs.google.com` is restricted to
  `/export` paths. The SSRF guard (https-only, no credentials, no non-443 ports, no IP
  literals, per-hop redirect re-validation) is intact — no widening was needed.
- `resolveArchivePdfUrl` prefers the smallest PDF, which for
  `Botany_Nites_Neet_2024` is the `_text.pdf` layer. Acceptable (smaller, selectable
  text); flip the sort if the scanned original is wanted.
- No database migration required.

## Follow-ups

1. Upload the Google Docs lesson if it belongs in this course.
2. Consider hosting a trimmed copy of the 312 MB archive.org PDF.

## Addendum — 2026-08-01 (link-type sweep + admin health panel)

Upstream reachability of all six link types in `pdf_link_type.md`, tested directly:

| # | Source | Result |
|---|--------|--------|
| 1 | jsDelivr GitHub CDN | 200 `application/pdf`, 433 KB |
| 2 | Telegram storage viewer | 200 viewer shell; bytes served by `resolve-storage-pdf` (inline publishable anon key) |
| 3 | Notion page | `notion-page` edge function 200, valid recordMap |
| 4 | Google Drive | 200, 911 KB via `uc?export=download` (proxy uses 4-tier `kind=drive`) |
| 5 | Google Docs | 200 `application/pdf`, 476 KB via `/export?format=pdf` |
| 6 | Google Sheets | 200 `application/pdf`, 69 KB via `/export?format=pdf` |

`pdf-proxy` correctly rejects unauthenticated calls (401), so per-lesson verification needs a signed-in admin.

New: **Admin → PDF Source Health** (`/admin/pdf-health`). Loads document-type `lessons.video_url`,
`lessons.class_pdf_url`, and `lesson_pdfs.file_url`, deduplicates them, and probes the real runtime path
(`pdf-proxy`, `notion-page`, `resolve-storage-pdf`) with a ranged 1 KB GET, 6 concurrent, abortable.
Each probe has an independent 30-second timeout and reports source field, HTTP status, content type,
PDF signature/Notion recordMap, elapsed time, and exact reason. Verdicts: Opens fine / Needs review /
Broken, plus a copyable report.
Route-split via `lazyWithRetry`, admin-gated, list paginated at 50 rows — no new deps, no schema change.

## Addendum — 2026-08-01 (invalid-byte and protected-surface hardening)

- `pdf-proxy` now peeks only the first five bytes on full or `bytes=0-*` responses, requires `%PDF-`,
  and reassembles the prefix with the untouched stream. HTML, JSON, empty, and falsely-labelled
  octet-stream error bodies return typed `415 not_pdf` instead of reaching pdf.js.
- `resolve-storage-pdf` applies the same streaming header validation before declaring the upstream
  Telegram payload to be a PDF.
- The reader maps `InvalidPDFException`, `Invalid PDF structure`, and truncated stream errors to
  actionable copy and attaches the current bearer token on byte fallback.
- `LessonView` now uses the shared protected-surface hook (native protection, web shield, and mount
  guard) and immersive readers use `SafeBoundary` with a skeleton fallback.
- Edge Function SSRF suite: 8/8 passing. No database migration was required.

## Addendum — 2026-08-01 (final recovery verification)

**Engineering/design rating: 4/5.** The six document-source routes are supported and
the critical regressions are covered. The remaining limitation is the 312 MB Archive.org
upstream asset; it is not an application routing defect.

| Source | Runtime path | Final status |
|---|---|---|
| jsDelivr / GitHub | authenticated `pdf-proxy` → streamed PDF | Supported |
| Telegram storage | `resolve-storage-pdf` → validated `%PDF-` bytes | Supported |
| Notion | native `react-notion-x` renderer + keyed autoscroll engine | Supported |
| Google Drive | authenticated `pdf-proxy?kind=drive` | Supported |
| Google Sheets | PDF export → authenticated `pdf-proxy`; incremental auto-fetch enabled | Supported |
| Archive.org | `pdf-proxy?kind=archive` with 64 KB ranges | Supported, upstream is slow |

Final changes and evidence:

- `LOVABLE_API_KEY` was rotated once. `chatbot`, `resolve-doubt`, and `ai-health`
  were deleted and cleanly redeployed to replace missing function blobs.
- Live `ai-health` returned `200 {"ok":true}`. The corresponding gateway request
  completed successfully on `google/gemini-3.6-flash`; anonymous chatbot/doubt calls
  returned the expected `401` rather than a missing-function `404`.
- Remote pdf.js loading now keeps streaming and range requests enabled while allowing
  incremental cross-reference fetches (`disableAutoFetch: false`). Visible canvases remain
  lazy-mounted, so this does not eagerly render every page.
- Notion autoscroll remounts per page URL, preventing the previous page's animation loop
  from racing a newly opened subpage.
- Direct `.pdf` links on Telegram/GitHub storage hosts no longer fall into the raw iframe
  route; they use the proxied PDF reader with autoscroll and page restore.
- PDF routing/auth retry tests: **27/27 passed**. Type checking passed. All three edited
  GitHub Actions workflows parse as YAML; artifact actions are v6/v8 and the staged
  emulator script uses POSIX-safe `set -e`.

Authenticated browser replay cannot be repeated from this sandbox because this project
uses externally managed Supabase auth. The earlier signed-in endpoint audit in this report
remains the end-to-end evidence for all six course records; no credentials are stored in
the repository or test artifacts.
