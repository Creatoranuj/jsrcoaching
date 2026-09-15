# PDF / Library System — Architecture & Crash Audit

This document explains the local-storage model and the fixes applied to the PDF
attachment system.

## 1. Local storage logic (3 tiers)

| Tier | What lives here | Code |
|------|-----------------|------|
| **MEMORY** | Only the visible page(s) are rendered by pdf.js. Off-screen pages are placeholders (IntersectionObserver), so RAM stays flat on huge PDFs. | `components/video/FastPdfReader.tsx` (`LazyPage`) |
| **INDEXEDDB** | Metadata, last-read page, and notes. Source of truth, always available (web + native). | `lib/libraryDB.ts` (`nb_library`), `lib/personalLibraryDB.ts` (`nb_personal_library`), `services/libraryNotes.ts` (`nb_reader`: `notes` + `progress` stores) |
| **FILESYSTEM** | The actual PDF bytes + a portable `note.md` mirror. | `services/personalLibrary.ts` → `Directory.Data/personal_library/`, downloads → `Directory.Data`, notes mirror → `Documents/MyLibrary/{id}/note.md` |

### Open flow
```
open(item)
  → getReadingPage(id)        // IndexedDB: restore scroll position
  → getItemUri(id)            // Filesystem.getUri + convertFileSrc
  → useLocalPdfSource(url)    // local file? fetch → blob: URL  |  remote? pass-through (streamed)
  → FastPdfReader renders     // visible pages only
  → onPageChange → setReadingPage(id)  // debounced persist
```

## 2. Bug fixes

1. **Obsidian notes** — `services/libraryNotes.ts` + `components/library/reader/NotesPanel.tsx`.
   Debounced (800ms) autosave to IndexedDB, mirrored to `Documents/MyLibrary/{id}/note.md`,
   `[[wikilink]]` extraction with clickable chips.
2. **Offline autoscroll** — local files used to fall into the `<iframe>` branch in
   `PdfViewer.tsx`, which has no scroll element so the FAB never attached. Local files now
   render through `FastPdfReader` (canvas). `useLocalPdfSource` turns `capacitor://`/
   `file://`/`localhost` URLs into a same-origin `blob:` URL the pdf.js worker can read.
3. **Large PDFs (>50MB)** — pdf.js streaming enabled (`disableAutoFetch:false`,
   `disableStream:false`, 64KB range chunks), on-demand page mounting, determinate
   progress bar from `onLoadProgress`. `vite.config.ts` sets `worker: { format: 'es' }`.
4. **Attachment autoscroll** — attachments use the same `DocReaderShell` → `PdfViewer`
   → `FastPdfReader` path; FAB lives outside the auto-hide wrapper.
5. **Downloaded / Library PDFs open in-app** — `DocReaderShell` renders everything in
   the canvas reader; no system chooser.
6. **Crash audit** — `lib/sentry.ts` `addBreadcrumb()` is fired on every open / local
   materialisation / load-success / load-error. Load errors are classified
   (`OutOfMemory`, `FileNotFound`, `WorkerFailed`, `InvalidPdf`) and sent via
   `captureException` with metadata.
7. **Storage manager** — `components/library/reader/StorageManagerSheet.tsx` shows
   per-tier usage and a clear-cache action (Downloads header → HardDrive icon).

## 3. Crash-test report (3 scenarios)

| Scenario | Before | After |
|----------|--------|-------|
| **100MB PDF** | Whole file buffered into memory → OOM crash | Streamed via 64KB range requests; only visible pages rendered; progress bar shown. Breadcrumb `pdf/load-success {pages}`. No OOM. |
| **Internet dropped mid-load** | Silent blank viewer | `onLoadError` → classified `FileNotFound`/`WorkerFailed`, error UI with "Open in new tab", breadcrumb + `captureException` recorded. |
| **Corrupted PDF** | Hard fail / white screen | `onLoadError` → classified `InvalidPdf`, graceful error card, exception captured with the (truncated) URL. |

> Telemetry only reports to Sentry in production builds with `VITE_SENTRY_DSN` set;
> in dev the breadcrumbs log to the console for debugging.

## 4. Build note (Vite 8)

`esbuild.drop` was removed from `vite.config.ts`. Vite 8 uses Rolldown/OXC as the
default minifier, so an `esbuild` block is ignored and emits
"Both esbuild and oxc options were set". Console stripping is left to the default
production minifier.
