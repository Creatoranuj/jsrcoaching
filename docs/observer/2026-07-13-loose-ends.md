# Observer Report — 2026-07-13 — Loose ends after Sentry-12 + PDF-blink session

**Window observed:** turns ~#83 … #98 (session of 2026-07-12 evening → 2026-07-13 01:24 IST)
**Scope:** Sentry-12 triage, migration for `lesson_chapters` / `lesson_quiz_markers` / `watched_intervals`, PDF popup / attachments-sheet blink fixes, security memory updates.

## Incomplete

- [ ] **`LessonAttachmentsSheet` bottom sheet still uses Radix `modal={true}` (default)** — *turn #98* — evidence: `src/components/lesson/LessonAttachmentsSheet.tsx` renders `<Sheet open={open && !viewer && !loading && notes.length !== 1}>` with no `modal={false}`. The session replay in #97/#98 shows the sheet opening → closing → reopening on the current preview (same blink class as `PdfSelectPopup` before its fix). Assistant flagged this in #98 ("caveat … same class of bug, different component") but did NOT patch. Next action: pass `modal={false}` + `onPointerDownOutside`/`onInteractOutside` on `<Sheet>` in `LessonAttachmentsSheet`, mirroring the `PdfSelectPopup` fix from turn #96.

- [ ] **Playwright verification of the PDF popup blink never actually ran** — *turn #98* — quote: "Dev server isn't reachable from the sandbox, so I verified by reading the shipped code instead of driving Playwright." Fix is code-reviewed only, not visually confirmed at 375 / 390 / 430 widths. Next action: re-run the Playwright script under `/tmp/browser/pdfpop/run.py` once the preview is reachable, or verify on device.

## Follow-ups deferred

- [ ] **On-device Sentry snapshot to confirm all 12 groups are silent** — *turn #92* — quote: "Migration + code patches shipped; run the app on device and the next Sentry snapshot should be clean." Blocker: needs a fresh APK build + a user session on device; not verifiable from the sandbox.
- [ ] **`create-razorpay-order` failure-path evidence** — *turn #92* — the enhanced 500 response now carries `{code, detail, user_id, course_id, status, body}` and writes `payment_events`, but nobody has forced a failing order yet to confirm Sentry `extra` receives the new fields. Blocker: needs a deliberate bad-input call to the edge function.
- [ ] **12 failing vitest tests from the prior session** — carried over from `2026-07-12-remaining-work.md`; not touched in the 2026-07-13 turns. Blocker: none — just needs a dedicated pass.
- [ ] **DocReaderShell APK back-button verify** — same carry-over from 2026-07-12; no evidence it was exercised on-device this session.

## Linked to current work

- `PdfSelectPopup` blink fix (turn #96, `modal={false}`) ↔ single-PDF auto-open drawer in `LessonAttachmentsSheet` (turns #26/#28). Both live on the same lesson surface; whichever of `<Dialog>` or `<Sheet>` toggles body scroll-lock will still cause the chip-strip / iframe reflow the user has been reporting since #25. Fixing only one leaves the visible blink in place when the sheet path (0 or >1 notes) is taken.
- Migration `20260713003112_*.sql` (chapters + quiz markers + `watched_intervals`) ↔ 400/404 storm on `/lessons/*` reported in #88. Turn #92's DB query confirmed the three schema objects exist; the frontend consumers (`useLessonChapters`, watched-intervals writer) were NOT re-verified against the new columns this session — worth a targeted `rg` before the next release cut.

## Dropped

- **All 11 skill tags in #95** (`/skill:app-crash-shield`, `/skill:asset-optimization`, `/skill:capacitor-back-button`, `/skill:capacitor-video-player-master`, `/skill:console-error-triage`, `/skill:mobile-view-Expert`, `/skill:senior-architect-audit`, `/skill:soft-touch`, `/skill:supabase-architect-auditor`, `/skill:red-team-security-audit`, `/skill:perf-exam-ready`) — the assistant only actioned the blink fix and skipped the rest. This was already flagged in `2026-07-08-verdict-audit-meta.md` as a net-negative pattern (Rating 2/5). Not re-proposing; noting as DROPPED per skill rules.

## Risks / ignored findings

- **`useLessonNotes` schema drift** — *turn #22* fixed the single-PDF "No attachment" bug by broadening the query to `videos.*_url`. No test was added; a future schema edit on `videos` can silently regress it. Accepted because: user unblocked, backlog pressure.
- **`nativeDebug.ts` suppression list is growing** — *turn #92* added regex filters for `DataCloneError`, `InvalidPDFException` with abort/blob, and `sentry_key=` fetch failures. Risk: over-suppression can hide a real pdf.js regression. Accepted because: current Sentry noise was drowning real signals; revisit after one release cycle.
- **`get_dashboard_snapshot` first call still aborts** — visible in the current network snapshot (`Error: The operation was aborted.` immediately followed by a 200 retry). The 3-attempt backoff in `Dashboard.tsx` (turn #92) is handling it, but the underlying JWT-race is still there. Accepted because: user-facing symptom is gone.

## Signal-only (nothing to do)

- Two migrations landed on 2026-07-13 (`20260713003112_*.sql`, `20260713004522_*.sql`); five code files edited in the Sentry-12 pass; one code file edited in the PDF-popup pass. All match the chat's claims.
- Security memory updated in #86 for the three findings from #83; no open CRITICAL/HIGH after that turn.

## Notes on visibility

- Chat search only returns user / assistant text, so migration bodies, edge-function deploys, and security-finding tool calls were cross-checked via the repo (`supabase/migrations/`, `rg` on the two components). All claims that could be verified from files hold up.
