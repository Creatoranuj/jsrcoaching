# Roadmap ― 4.1 → 5/5 hardening

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

- [x] Razorpay checkout blank screen (Capacitor/app WebView) — native SDK callback lifecycle hardened; Android build #195 passed
- [x] Verify `Creatoranuj's Project` backend connection after workspace move
- [x] Harden native Razorpay callback validation and produce a verified Android APK (GitHub Android build #195 passed)
- [x] "Opening payment" stuck fix — native cancel() now reports whether the Razorpay sheet is still open; JS watchdog keeps waiting instead of orphaning a live payment
- [x] "Opening payment" stuck — REAL root cause fixed. `com.razorpay:checkout` resolved `standard-core:LATEST` (1.7.x), where `Checkout` is a Fragment that reports the result to the host Activity via `PaymentResultWithDataListener`; `MainActivity` never implemented it, so the result vanished (verified by decompiling the published APK). Fix: MainActivity implements the listeners → `RazorpayNativePlugin.deliver*()` single-settle; `standard-core` pinned to 1.7.18; JS live-sheet ceiling raised to ~10 min and now raises `RazorpaySheetUnresponsiveError` (no web fallback under a live sheet). Validation: tsc, 686 Vitest (Playwright intentionally NOT run).
- [ ] Physical-device confirmation of the fixed APK: UPI tile → GPay/PhonePe round-trip → enrollment (cannot be proven in CI)
