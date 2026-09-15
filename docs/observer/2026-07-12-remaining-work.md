# Observer Report — 2026-07-12 — Remaining Work (post-PDF-drawer session)

**Window observed:** turns 55…94 (last full session)
**Scope:** Lecture card PDF chip, attachments drawer, LessonView PDF pill, MyCourses filters, security/tests loose ends.

## Incomplete
- [ ] **Unit tests still failing (12 / 199)** — *turn #57* — evidence: "Unit tests — 12 failing / 199 total (94% pass)": `Login.test.tsx` (7 stale selectors), `resolveContentUrl.test.ts` (2 legacy public-URL sign), `pdf-system.test.ts` (1 IndexedDB URI edge case), `definer-grants.integration.test.ts` (1 possible `get_course_lesson_stats` anon leak). Never revisited after #57. Next action: refresh `Login.test.tsx` selectors first (safest), then re-check `definer-grants` — see migration `20260712043047` which already regrants to `authenticated`; the test may just need the anon-revoke assertion updated.
- [ ] **`get_course_lesson_stats` anon-leak claim** — *turn #57* — evidence: "[HIGH] Investigate `get_course_lesson_stats` anon leak — verify RLS/grants on that RPC." Migrations `20260708…` and `20260709…` revoke from `anon`/`PUBLIC`, `20260712043047` grants to `authenticated`. Looks resolved in DB, but the failing test in #57 was never re-run to confirm. Next action: `bunx vitest run src/test/definer-grants.integration.test.ts`.
- [ ] **Edge Function "Call Failed" on LessonView** — *turn #75* — evidence: user reported "Error Check Edge function Call Failed Edge Function Call lesson View". Assistant asked for lesson ID / toast text (#76) and never received it, so the actual failure was never reproduced. Next action: reproduce via Playwright on `/classes/:id/lessons/:lessonId` and capture the toast + `get-lesson-url` network payload, then check `403 Purchase required` vs `400 Invalid lesson_id`.

## Follow-ups deferred
- [ ] **Leaked-password protection** — *turn #56* — blocker: "The AI also noted the user needs to manually enable leaked-password protection in the Supabase Auth dashboard." Manual Supabase dashboard toggle, not code.
- [ ] **Aborted anonymous-dashboard requests** (`site_stats`, `platform-stats`, `landing_content`) — *turn #57* — accepted as "Harmless (React Query abort), no user impact." Only worth acting on if it clogs logs.

## Linked to current work
- Current turn's `DocReaderShell` overlay in `LessonAttachmentsSheet` ↔ turn #14: yellow-circled `ListVideo` toolbar button was removed from the LessonView inline reader. The overlay path bypasses that reader entirely, so #14's regression risk is inert here — but any future re-enable of the in-LessonView reader has to keep the removal.
- Current PDF chip redesign ↔ turn #76: `AttachmentRow` was already reworked to render PDFs with the same tile + "View" button. `LectureCard` now matches — the two components share visual language. Any future icon/label change must be applied in both.
- Current `pdf-progress` progress bar in `PdfViewer` ↔ turn #14's `DocumentReader.tsx` progress listener: both consume the same `pdf-progress` custom event dispatched by `FastPdfReader` and the pdfjs bridge. If the event name is ever renamed, three consumers need updating (`PdfViewer`, `DocumentReader`, `ReaderProgress`).

## Dropped
- **`src/components/Layout/CoursesLayout.tsx` search/filter refactor** — *turn #56* — the assistant's summary claims edits to this file, but the file does not exist in the repo (`src/components/Layout/` contains only `BottomNav / EdgeSwipeIndicator / GlobalBottomNav / Header / NotificationDropdown / Sidebar`). The response was flagged `[Response was cancelled]`. The equivalent functionality (search-icon toggle, type-to-confirm delete, paste blocking) is implemented directly in `src/pages/MyCourses.tsx` (lines 279–539, 636–649), so nothing actually to redo — but the report in #56 is misleading and should not be trusted for future audits.

## Risks / ignored findings
- **DocReaderShell "second reader surface in Capacitor APK" caveat** — the pre-existing comment in `LessonAttachmentsSheet.tsx` warned that DocReaderShell "kept spinning for Notion / Drive / CDN links" on APK. The current turn removed the LessonView-navigation path and unconditionally uses DocReaderShell. Web works, but APK behaviour for Notion / Drive attachments opened from the drawer is UNVERIFIED. Next action: run `maestro/pdf-back.yaml` on APK after next build and confirm no spinner-loop.
- **Legacy `src/lib/openPdfHybrid.ts`** — returns `false` unconditionally; kept as a "switch" per its own comment. Dead branch until someone decides to reintroduce native handoff.

## Signal-only (nothing to do)
- Two security findings (`comment_images_public_read_policy`, `study_materials_missing_status_check`) closed via migration `20260712071136_651c3d44…` — confirmed in repo.
- Supabase project connection re-done in #82; `supabase/config.toml` + client generated.
- PDF icon PNG → SVG migration (#76) confirmed in `src/assets/pdf-icon-grayscale.svg`, PNG asset JSON deleted.

## Notes on visibility
- Tool activity (migrations, security scans, `manage_security_finding`, edge function log queries) is NOT in the chat search index — cross-checks above rely on repo state (`supabase/migrations/`, source files).
- Screenshots and the uploaded `screen-20260712-131505.mp4` from turn #93 are not searchable; visual regressions have to be re-verified via Playwright on the live preview.