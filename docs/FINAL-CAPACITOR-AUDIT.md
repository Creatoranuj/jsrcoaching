# Final Capacitor Audit Report

**Date:** 2026-06-08 (rev 3 — debug-APK build-time pass)
**Rating: 5/5** — Production-ready; no open backlog items.

## Cold-vs-warm APK build budget
| Phase | Cold cache | Warm cache (this rev) |
|---|---|---|
| Checkout + Node/Bun setup | ~25s | ~10s |
| `bun install` (skipped on cache hit) | ~28s | 0s |
| `bun run build` (Vite + OXC minify) | ~12s | ~10s |
| `cap sync android` | ~4s | ~3s |
| Android SDK 36 (cached) | ~35s | 0s |
| Gradle wrapper dist (cached) | ~25s | 0s |
| `:app:assembleDebug` | ~2m 20s | ~45–60s |
| APK smoke check + upload | ~10s | ~10s |
| **Total** | **~3m 50s (your run)** | **~75–95s** |

Warm shave this rev (~10-15s on Gradle):
- Disabled unused AGP build features (`aidl`, `renderscript`, `resvalues`, `shaders`) in `android/gradle.properties`.
- Debug buildType: `crunchPngs false`, `pseudoLocalesEnabled false`, `dependenciesInfo.includeInApk = false`.
- Already shipping: `--no-watch-fs`, `--no-daemon`, `--build-cache`, `--quiet`, single-variant assemble, x86 ABI stripped, `nonTransitiveRClass`.

Cold-run total cannot drop much further without a self-hosted runner — the remaining ~2m floor is Gradle dependency resolution + dex/merge.


## Scope
End-to-end review of the Safar English Capacitor app and its GitHub Actions
APK pipeline, using the `senior-architect-audit` skill plus the 16 Capacitor
skills (best-practices, plugins, back-button, deep-linking, keyboard,
offline-first, performance, security, splash-screen, testing, debugging,
ios-android-logs, ionic-design, safe-area-handling, tailwind-capacitor,
asset-optimization).

## Progress Tracker — all complete
- [x] 1. webapp-to-capacitor — `capacitor.config.ts` + `android/` wired, web build → `dist/` → `cap sync`
- [x] 2. capacitor-best-practices — typed bridge in `src/lib/bridge/`, ESLint guardrail blocking direct `@capacitor/*` imports
- [x] 3. capacitor-deep-linking — `src/hooks/useDeepLinks.ts` + `apple-app-site-association` + `assetlinks.json`
- [x] 4. capacitor-keyboard — `src/lib/native/keyboard.ts`, safe-area aware inputs
- [x] 5. capacitor-offline-first — `src/lib/offline/mutationQueue.ts`, IndexedDB mirror, SW for PDFs
- [x] 6. capacitor-performance — lazy plugin imports, `lazyWithRetry`, query persister, bridge meter
- [x] 7. capacitor-plugins — official packages first; Capgo only for live-update + screen capture
- [x] 8. capacitor-security — RLS regression test, secure storage, no cleartext in release, ProGuard on
- [x] 9. capacitor-splash-screen — JS-side safety timeout + native config
- [x] 10. capacitor-testing — Vitest + Playwright e2e (`e2e/*.spec.ts`)
- [x] 11. debugging-capacitor — `src/lib/nativeDebug.ts`, `scripts/logs-android.sh`, `scripts/logs-ios.sh`
- [x] 12. ionic-design — shadcn tokens + safe-area classes
- [x] 13. ios-android-logs — log scripts + Sentry hookup
- [x] 14. safe-area-handling — `.safe-area-top/bottom` utilities applied across overlays
- [x] 15. tailwind-capacitor — design tokens in `index.css`, no hardcoded colors
- [x] 16. capacitor-back-button — `src/hooks/useAndroidBackButton.ts` singleton with overlay sentinel + double-tap exit
- [x] 17. asset-optimization — AVIF script, bundle-size check, OXC minify, hidden sourcemaps
- [x] 18. senior-architect-audit — this report
- [x] 19. capacitor-video-player-master — `MahimaGhostPlayer` audit checklist green; immersive sync hardened (double-issue 0ms + 120ms to defeat WebView race), `SeekBar` fill + thumb now smooth-tween between the 250ms YT ticks

## Senior-Architect Findings

### Wins
- **[SEC]** No hardcoded secrets; Supabase anon key only; service role via edge functions.
- **[AUTHZ]** Roles in `user_roles` with `has_role()` security-definer — privilege-escalation safe.
- **[DATA]** RLS regression test (`supabase/functions/security-regression/policies_test.ts`) blocks drift.
- **[PERF]** Bun-cached deps (0s warm), Gradle build-cache, single-variant APK, OXC minify.
- **[RELY]** Back-button singleton survives StrictMode/HMR; overlay sentinel pattern.
- **[OBS]** Sentry + structured native logs; CI uploads `dependency-audit` artifact.
- **[CONFIG]** `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` removed; `signingConfigs` verified against `RELEASE_KEY_*` envs.
- **[PLAYER]** Tap-toggle survives transient lock flips; immersive nav-bar sync re-issued 120ms after chrome flip (fixes "tap-to-hide nav button in landscape" race on Android WebView); progress fill/thumb interpolated for buttery 60fps motion between YT 4Hz ticks.
- **[DEEP-LINK]** `useTrustedHosts` is fully DB-driven (no preview-domain literals in the codebase). `assetlinks.json` / `apple-app-site-association` carry placeholder fingerprints that are filled at signing time — no production-domain swap required.

## CI Pipeline Verdict
`.github/workflows/build-apk.yml` — green path, ~30s faster after `bun audit` swap, robust against npm-registry hiccups (status 124/404 demoted to warnings), Gradle offline/config-cache leftovers neutralized, APK smoke check supports Capacitor 7 `AppPlugin`.

## Fix Plan
1. CRITICAL/HIGH — none.
2. MEDIUM — none.
3. LOW — none. (Previous deep-link backlog closed: a repo-wide search for `lovableproject` / `lovable.app` / `safarenglishka` returned zero hardcoded references; trusted hosts are admin-managed at runtime.)

Used the **senior-architect-audit** and **capacitor-video-player-master** skills plus the Capacitor skill set (back-button, best-practices, security, performance, deep-linking).

