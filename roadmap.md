# Roadmap — 4.1 → 5/5 hardening

- [x] Typecheck + build CI (workflow `typecheck-build.yml`, commit 8334c88)
- [x] Review 17 SECURITY DEFINER functions — all verified safe-by-design (admin functions self-check role; read helpers scope by auth.uid(); all have fixed search_path). No revocation: would break app + RLS.
- [x] Migration-drift CI (workflow `migration-drift.yml`, commit e249814) — informational until baseline verified
- [x] Lint cleanup phase 1 — 617 → 576 warnings (41 stale disable-comments auto-removed)
- [x] LessonView split phase 1 — Smart Notes panel extracted to `src/features/lesson/components/LessonNotesPanel.tsx` (2558 → 2284 lines); tests/typecheck/build all green
- [x] AUDIT_REPORT.md updated — overall 4.1 → 4.7
- [ ] Leaked-password protection — deferred by owner (dashboard toggle)
- [ ] LessonView split phase 2 — attachment/PDF section
- [ ] Remaining 529 `any` warnings — gradual
- [ ] Flip migration-drift CI to blocking after first clean run
