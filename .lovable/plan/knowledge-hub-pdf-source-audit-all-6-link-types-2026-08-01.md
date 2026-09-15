# Knowledge Hub PDF Source Audit — all 6 link types

## What I verified right now (no login needed)

I tested every link in your `pdf_link_type.md` directly from the sandbox. All six upstream sources are alive:

| # | Source | Check | Result |
|---|--------|-------|--------|
| 1 | GitHub CDN (jsDelivr) | direct GET | 200, `application/pdf`, 433 KB |
| 2 | Telegram storage viewer | direct GET | 200 (HTML viewer shell — bytes come from `resolve-storage-pdf`, fixed earlier today) |
| 3 | Notion page | live `notion-page` edge function | 200, valid recordMap returned |
| 4 | Google Drive | `uc?export=download` | 200, 911 KB |
| 5 | Google Docs | `/export?format=pdf` | 200, `application/pdf`, 476 KB |
| 6 | Google Sheets | `/export?format=pdf` | 200, `application/pdf`, 69 KB |

App-side routing lines up too: `pdf-proxy` allow-lists jsDelivr, the Naveen storage host, archive.org and the Google `document|spreadsheets|presentation/d/<id>/export` paths; Drive uses the dedicated 4-tier `kind=drive` path; Notion matches `.notion.so`, `.notion.site` and `.notion.com`.

## What I could NOT verify

I cannot sign in to your account. This project reports no injected session to the sandbox, so `pdf-proxy` answers me `401` on every call and I cannot open real Knowledge Hub lessons as admin. Creating a new account myself would not help — the proxy also enforces enrollment/staff checks per lesson.

So the open question is not "does source type X work" (verified above) but "does every actual lesson row in Knowledge Hub store a URL shape the resolver accepts". That needs a signed-in run.

## Proposed fix: an admin-run source health check

Add an admin-only **PDF Source Health** panel (in the Admin area, next to Trusted Hosts) that:

1. Loads every lesson PDF / content URL for a chosen course (default: Knowledge Hub).
2. Classifies each URL with the existing `resolveContentUrl` / `pdfViewerUrl` logic (drive / docs / sheets / notion / jsdelivr / storage-viewer / archive / unknown).
3. Probes each one through the exact path the student reader uses (`pdf-proxy`, `notion-page`, `resolve-storage-pdf`) using your admin session.
4. Renders a table: lesson, source type, HTTP status, content-type, size, verdict (OK / needs fix), failure reason.
5. Offers a "Copy report" button so you can paste results back to me for fixes.

Reuses `shareAccessCheck.ts` and `readerDiagnostics.ts` — no new backend, no schema change, no new secrets.

## Perf guardrails (exam-season playbook)

- Route-split with `lazyWithRetry`; admin-only, so it never enters the student bundle.
- Concurrency cap of 6 with `AbortController` cleanup, so a large course cannot stall the WebView.
- Row list virtualized past 30 rows.
- Ranged `GET` (first 1 KB) instead of full downloads — auditing 200 PDFs costs kilobytes, not gigabytes.
- No change to `FastPdfReader` streaming flags, splash timeout, or the back-button handler.

## Technical notes

- New page `src/pages/AdminPdfHealth.tsx` plus a route beside the other admin routes.
- New hook `src/hooks/usePdfSourceHealth.ts` with the classify + probe logic.
- No edge function changes planned unless the report finds a source type the allow-list rejects; likeliest candidate is a Drive link stored as a raw `drive.google.com/file/d/.../view` URL that must be normalized to `kind=drive&id=` before the proxy sees it.
- Findings appended to `docs/AUDIT-2026-08-01-knowledge-hub-pdfs.md`.