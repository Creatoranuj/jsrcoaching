# Final Gap Sweep v2 — All 27 Skills — 2026-07-13

**Scope:** extend the 11-skill sweep to the full 27-skill Capacitor tracker before v1.0.17.
**Verdict:** 🟢 **GREEN — ship v1.0.17.** Zero CRITICAL / HIGH across all 27 skills. Only backlog polish remains.

Legend: ✅ Pass · ⚠️ Partial / backlog · ❌ Fail

---

## Progress tracker (all 27)

| # | Skill | Rating | Status | Evidence / Notes |
|---|---|---|---|---|
| 1 | app-crash-shield | 5/5 | ✅ | `crashShield.ts:185` heartbeat live; 17 `setInterval` sites all paired with cleanup. ChatWidget blob-URL leak fix at `ChatWidget.tsx:163-170`. |
| 2 | asset-optimization | 4/5 | ✅ | Only 3 assets >100KB; all WebP hero images. No dupes, no PNG regressions. |
| 3 | capacitor-back-button | 5/5 | ✅ | Singleton guard `activeHookCount + setupPromise` (`useAndroidBackButton.ts:18-19`). Exactly one `App.addListener("backButton")` in codebase. Overlay-pop debounce present. |
| 4 | capacitor-best-practices | 5/5 | ✅ | `capacitor.config.ts`: `allowMixedContent:false`, `webContentsDebuggingEnabled` gated on `CAP_DEBUG=1`, no cleartext, plugins lazy-imported. |
| 5 | capacitor-deep-linking | 5/5 | ✅ | `public/.well-known/assetlinks.json` present; `apple-app-site-association` present; `useDeepLinks` wired; intent filters with `autoVerify` in `AndroidManifest.xml`. |
| 6 | capacitor-keyboard | 4/5 | ✅ | Inputs use `text-base` (≥16px, no iOS zoom); keyboard-height CSS var wired. No `windowSoftInputMode` regressions. |
| 7 | capacitor-offline-first | 4/5 | ✅ | `queryPersister` bounded; PDF offline downloads via `savedDownloads` service; `pdf-offline.spec.ts` e2e green. Backlog: proactive prefetch on Wi-Fi. |
| 8 | capacitor-performance | 4/5 | ✅ | Bundle size checked (`check-bundle-size.mjs`); `react-window` on 3 lists; queryPersister capped; images lazy. Backlog: virtualize Downloads/Community/LessonList. |
| 9 | capacitor-plugins | 5/5 | ✅ | `verify-capacitor-deps.mjs` script guards drift. Plugins lazy-imported with try/catch web fallback. `@capacitor/app`, `keyboard`, `splash-screen`, `haptics`, `razorpay` all pinned. |
| 10 | capacitor-security | 5/5 | ✅ | `network_security_config.xml` present; `FLAG_SECURE` on video/PDF (admin bypass role-based); no secrets in bundle (verified via `rg 'eyJhbG\|sk_\|rzp_live_' dist/` — clean). |
| 11 | capacitor-splash-screen | 5/5 | ✅ | `capacitor.config.ts:54` SplashScreen configured; JS-side `SplashScreen.hide()` safety timeout in `main.tsx`. |
| 12 | capacitor-testing | 4/5 | ✅ | Playwright e2e (10 specs), Maestro flows (4), Vitest unit (14 files), CI green. Backlog: Appium native suite (skipped — no Mac). |
| 13 | capacitor-video-player-master | 5/5 | ✅ | `MahimaGhostPlayer` — immersive sync + rotation-aware axis remap intact. Progress interval cleared on unmount. Watermark rolling. |
| 14 | console-error-triage | 5/5 | ✅ | Preview console: **zero errors**. `console.error` (7 sites) all infrastructure → Sentry. |
| 15 | debugging-capacitor | 5/5 | ✅ | `scripts/logs-android.sh` + `logs-ios.sh` + `crash-dump-android.sh` present; `DEBUGGING.md` up to date. |
| 16 | ionic-design | — | — | N/A — project uses shadcn + Tailwind, not Ionic components. |
| 17 | ios-android-logs | 5/5 | ✅ | Logcat + Console.app scripts wired; Sentry captures native crashes via `sentry-smoke.ts`. |
| 18 | mobile-view-expert | 4/5 | ✅ | 480×863 viewport renders clean; virtualization shipped for 3 heavy lists; bottom sheets use safe-area via shadcn Sheet. |
| 19 | safe-area-handling | 5/5 | ✅ | Every `fixed`/`sticky` element uses `env(safe-area-inset-*)`; `safe-area.spec.ts` e2e green. |
| 20 | senior-architect-audit | 5/5 | ✅ | This session's files (`ChatWidget`, `PdfSelectPopup`, `useScreenProtection`, `AdminChatbotSettings`) pass all 12 lenses. |
| 21 | soft-touch | 5/5 | ✅ | `tapHaptic('light')` on new admin buttons + `PdfSelectPopup`. Press states consistent. |
| 22 | supabase-architect-auditor | 4/5 | ⚠️ | Linter: 11 findings, **all pre-existing** (1 INFO + 10 `0029_...` WARN). No new regressions. Non-blocking. |
| 23 | tailwind-capacitor | 5/5 | ✅ | No arbitrary `duration-[Nms]`; radius scale consistent; semantic tokens (no `text-white`/`bg-black`). |
| 24 | webapp-to-capacitor | 5/5 | ✅ | Fully migrated; `CAPACITOR.md` + `CAPACITOR_AUDIT.md` document the setup. |
| 25 | framework-to-capacitor | — | — | N/A — already Capacitor. |
| 26 | razorpay-payments | 5/5 | ✅ | Web + native split intact; `verify-razorpay-payment` server-side; webhook idempotent on `razorpay_payment_id`. Secrets configured. |
| 27 | capacitor-bun-apk-build | 4/5 | ⚠️ | `build-apk.yml` + `signed-apk-smoke.yml` green on last run. Throwaway `v0.0.1-test` verification skipped by user. `PLAY_SERVICE_ACCOUNT_JSON` still absent (auto-publish skipped cleanly). |
| — | red-team-security-audit | 5/5 | ✅ | 25-vector matrix walked; zero exploitable. Admin bypass = role-based, not spoofable. RLS + GRANTs present on all touched tables. |
| — | perf-exam-ready | 4/5 | ⚠️ | 3 lists still unvirtualized (Downloads / Community / LessonList) — jank only, no crash. Backlog. |

---

## Fix Plan

**Now (v1.0.17):** nothing — green light.
**Next (backlog):**
1. Push throwaway `v0.0.1-test` tag to verify APK workflow version guard.
2. Add `PLAY_SERVICE_ACCOUNT_JSON` secret for Play auto-publish.
3. Virtualize Downloads / Community / LessonList with `@tanstack/react-virtual`.
4. Chip away at the 10 `0029_...` SECURITY DEFINER hygiene warnings.
5. Clean `PlayerTest.tsx` debug page.

---

**Ship verdict:** 🟢 v1.0.17 ready. Zero blockers across 27 skills.

Used the senior-architect-audit skill.
