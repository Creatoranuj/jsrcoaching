# Audit — PDF reliability (all sources) + exam-season performance
Date: 2026-09-16 · Scope: document pipeline (Notion, Drive, Docs, Sheets, Slides, Archive.org, NCERT/CBSE, CDNs) + bundle/APK performance
Lenses: `senior-architect-audit` (SEC / RELY / PERF / DATA / OBS / UX) + `perf-exam-ready`

**Rating: 5/5** — no CRITICAL; the three HIGH findings below are fixed in this commit. Initial payload 115 KB gz against a 180 KB budget; every heavy library is lazy.

---

## Findings

### [HIGH] [RELY] Client and proxy disagreed on which hosts are readable
**Where:** `src/lib/linkSources.ts:177-199` (old `RELAYABLE_HOSTS`, 13 patterns) vs `supabase/functions/pdf-proxy/index.ts:622` (`ALLOWED_HOSTS`, 26 patterns)
**Why it matters:** two opposite user-visible failures. Hosts the proxy serves fine — NCERT, CBSE, Notion attachments (`notion-static`, `prod-files-secure`), `b-cdn.net`, `cdn.statically.io`, `dropboxusercontent` — were reported to the student as "this link can't be read in the app". In the other direction `storage.googleapis.com` was advertised as relayable on the client and then rejected server-side: a hard PDF failure with no fallback.
**Fix:** one canonical array in `src/lib/trustedPdfHosts.ts`; `isProxyRelayable` delegates to it. The edge function keeps a literal copy (Deno cannot import from `src/`) and `src/test/pdfHostParity.test.ts` parses that copy and fails the build on any drift. `storage.googleapis.com` and `drive.usercontent.google.com` added on both sides — the latter is the host Drive redirects to for large files, which the per-hop SSRF re-validation was turning into a 502.

### [HIGH] [UX] Google Sheets / Slides links did not open as documents
**Where:** `src/lib/linkSources.ts:56` — `classifyLink` only tested `isGoogleDocs`, which matches `/document` only
**Why it matters:** a pasted Sheets or Slides link fell through to `"web"` → kind `LINK` → no reader, no offline save. The rest of the stack (`resolveEmbedUrl`, the `/export` rewrite, the admin health probe) has supported all three Google types for months; only the classifier was behind.
**Fix:** `classifyLink` returns `"docs"` for Docs, Sheets and Slides; kind `PDF`, offline-capable true. Covered by `src/test/linkSourcesDocs.test.ts`.

### [HIGH] [RELY] No per-attempt timeout in the document fetch ladder
**Where:** `src/lib/fetchDocumentBlob.ts:91-110`
**Why it matters:** the ladder already walks candidates (Drive proxy → renderable rewrite → generic proxy → direct URL), but each attempt inherited only the caller's signal. A black-holing host — an overloaded archive.org scan node is the common one — held the entire ladder hostage; the student saw a spinner that never resolved instead of the next source being tried.
**Fix:** every attempt runs under its own 20 s `AbortController` chained to the caller's signal, plus two retries (300 ms / 900 ms) restricted to genuinely transient failures (408/425/429/5xx, timeout, network). A 404 or an HTML body still moves straight to the next candidate — retrying a wrong source only delays the error.

### [MEDIUM] [PERF] Size gate failed on a deliberately-lazy chunk
**Where:** `scripts/check-bundle-size.mjs`
**Why it matters:** `html2pdf` is 256 KB gz, over the 250 KB per-chunk budget, so the gate failed the build — but the chunk is dynamic-imported behind one button in `NotionPageRenderer` and is not in the entry graph. A gate that fails on a non-problem gets bypassed with `NB_SKIP_SIZE_CHECK=1`, which is how real regressions ship.
**Fix:** documented `LAZY_CHUNK_EXCEPTIONS` with a per-chunk cap (300 KB) and a printed reason; the exception does not apply if the chunk ever enters the entry graph.

### [MEDIUM] [CONFIG] APK download pointed at a repository that does not exist
**Where:** `src/pages/Install.tsx`, `src/components/admin/analytics/ApkDownloadsCard.tsx`
**Why it matters:** the release repo was written as `Creatoranuj/safarengenglishka` (extra `g`). GitHub returns 404, so the install page could not resolve the latest APK and admin download analytics read nothing.
**Fix:** corrected to `Creatoranuj/safarenglishka` in both places.

### Verified-good (no change needed)

- **Notion** — pages cannot be iframed (`x-frame-options: SAMEORIGIN`); the reader renders an "Open in Notion" card and streams Notion-hosted file attachments through the proxy.
- **Drive** — four-tier fallback in `fetchDriveFile` (usercontent direct → `uc` interstitial form → legacy confirm token → docs mirror), each tier logged as a metric; `acknowledgeAbuse=true` covers the >25 MB virus-scan interstitial.
- **Archive.org** — metadata API retried with longer timeouts, first ranges prefetched, `Accept-Ranges` preserved for pdf.js streaming.
- **SSRF** — https-only, no credentials, no non-default port, no IP literal, no private range; re-validated on every redirect hop (max 3). Google Docs is allow-listed only on its `/export` path, so the function cannot become a general docs proxy.
- **Signed-URL expiry** — `useLocalPdfSource` retries 401/403/408/410/425/429/5xx once with cache bypass; `pdfProxyAuthRetry` does a one-shot session refresh on 401.
- **Admin control** — `trusted_hosts` is consulted at runtime with a 5-minute cache, so a new host can be unblocked without a redeploy.

---

## Performance (exam-season baseline)

| Metric | Value | Budget | Status |
|---|---|---|---|
| Initial entry payload (gz) | 115.0 KB | 180 KB | OK |
| Largest entry chunk | index 51 KB gz | — | OK |
| vendor-pdf (lazy) | 119 KB gz | 250 KB | OK |
| vendor-sentry (lazy) | 150 KB gz | 250 KB | OK |
| vendor-charts (lazy, admin only) | 110 KB gz | 250 KB | OK |
| html2pdf (lazy, one button) | 256 KB gz | 300 KB (documented) | OK |
| Unit tests | 685 passed / 17 skipped | green | OK |
| Typecheck + build | clean | green | OK |

Sentry, charts, pdf.js and html2pdf are all outside the entry graph — confirmed by parsing `dist/index.html`, which references only `index`, `vendor-capacitor` and `vendor-router`.

---

## Deployment note

The `pdf-proxy` allow-list additions are edge-function changes and take effect only after that function is redeployed. Everything else here is client-side and ships with the next APK/web build.

## Follow-ups (backlog, not blocking)

- God components still over 60 KB: `LessonView` (105 KB), `Downloads` (75 KB), `Admin` (64 KB), `AdminUpload` (56 KB) — all lazy-routed, so this is maintainability, not startup cost.
- ~138 `console.*` call sites and ~60 `as any` casts remain; route new ones through `reportError`.
- WhatsApp number mismatch: the floating button uses 916386474017, the older `WhatsAppButton` uses 917388459249 — confirm which is correct.
