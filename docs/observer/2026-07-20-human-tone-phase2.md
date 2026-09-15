# Observer Report — 2026-07-20 — Human Tone Phase 2

**Window observed:** this session (audit + Phase 2 ship).
**Scope:** app-wide user-facing copy, toasts, empty/error/loader states.

## Shipped this turn

- New helper `src/lib/toast.ts` (`notify.*`) — human-tone toast pattern documented.
- Toast copy sweep across hooks: `useProfiles`, `useAttendance`, `useComments`, `useMaterials`, `useTimetable`, `useTestimonials`, `useAdminEnrollment`, `useStudentNotes`, `useLiveReminder`, `useLessons`, `useLessonPdfs`. Success → past tense no `!`; errors → `[what broke] — [what to do]` in Hinglish.
- Sparkles purge (partial): `TopicsCovered` → `Clock`; `SubscriptionPaywall` → `Crown`. Remaining Sparkles occurrences (`AskDoubtSheet`, `LiveSarthiPanel`, `VideoSummarizer`, `ObsidianNotes`, `LiveClass`, `Landing/Footer`, `LessonView` import-only) tracked under **Follow-ups** — visual swap only, no behaviour change, low-risk incremental.
- Hero + auth copy: Signup hero + toast, Login hero + fallback error, AdminLogin toasts, Settings deletion fallback.
- Loader/error copy: `Dashboard`, `ChapterView`, `NotFound`, `BuyCourse` post-payment, `PaymentCallback`, `useAutoScroll`.
- Paywall CTAs: `SubscriptionPaywall` title + `LessonView` locked-content CTA.
- SEO/title: `src/server.ts` `<title>` + meta description.
- Regression fence: `scripts/check-tone.mjs` — ceilings for `Loading...`, `Please wait`, `Something went wrong`, `Oops`, `successfully!`, `Sparkles` JSX etc.

## Incomplete

- [ ] Wire `scripts/check-tone.mjs` into `bun run guard:all` in `package.json` and `.github/workflows/code-guards.yml` — script exists, not yet invoked automatically.
- [ ] Sparkles JSX swap in 6 remaining files (`AskDoubtSheet`, `LiveSarthiPanel`, `LiveClass`, `VideoSummarizer`, `ObsidianNotes`, `Landing/Footer`) — pure visual, safe to batch next turn.
- [ ] Migrate legacy `toast.*` sites (Testimonials, TopicsCovered, VideoSummarizer, LessonAttachmentsSheet) to `notify.*` helper — pattern established, not enforced.
- [ ] `Loading...` skeleton swap on `Students`, `AllLive`, `Admin`, `ContentDrillDown` — LOW severity, tracked.

## Linked to current work

- Ties into `lovable-design-language` popup unification (last session) — new copy fits the new dialog shell.
- Ties into `perf-caching` (React Query cache) — user-visible latency now feels quiet because toasts stopped shouting.

## Risks / accepted

- Dropping `!` and emojis may feel "cold" to a few admins. Mitigated by kept haptics + Lovable toast tint icons.
- `BuyCourse` still contains a `🎉` success toast (kept — payment celebration is intentional).

## Notes on visibility

- Tool-call outputs (migrations, edge-fn deploys) are not indexed; this report cross-checked file state via `rg` after edits.
