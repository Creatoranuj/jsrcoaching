# Release-Readiness Freeze Summary

**Status:** Architecture frozen. Not publishing to Play Store yet.
**Date:** 2026-06-06
**Overall architecture rating:** 9.8 / 10
**Play Store readiness today:** 7 / 10 (release-time items deferred)

---

## 1. Verified Build Evidence

`npm run build` — ✅ passes (Vite + bundle-size gate)

| Metric              | Value      | Budget   | Status |
| ------------------- | ---------- | -------- | ------ |
| Initial entry total | 92.3 KB    | 220 KB   | ✅     |
| Largest chunk       | 215.5 KB   | 300 KB   | ✅     |
| Bundle-size gate    | OK         | —        | ✅     |
| Build time          | ~5.25 s    | —        | ✅     |

## 2. Capacitor Sync Evidence

`npx cap sync android` — ✅ passes (~0.6 s)
- 20 Capacitor plugins synced
- `dist/` copied into `android/app/src/main/assets/public`
- No plugin resolution errors

## 3. Completed Phases

- ✅ Asset / CDN optimization (Bunny, image budget, lazy load policy)
- ✅ Phase 1 — Capacitor foundation (config, splash, status bar, keyboard)
- ✅ Phase 2 — Mobile UX (safe area, bottom nav, haptics, native chrome)
- ✅ Phase 3 — Offline + Performance + Splash (cache shell, SplashHider, query persister)
- ✅ Phase 4 — Deep Links + External Link Safety
- ✅ Phase 4 O2 — `window.open` hardening (`noopener,noreferrer` / `openExternal`)
- ✅ Phase 5 — Release QA / Debugging docs
- ✅ Phase 6 — Release Gate (web build + Capacitor sync verified)

## 4. Intentionally Deferred (Release-Time Only)

Do **not** execute these until Play Store launch is near:

- Android SDK local debug/release build on CI (env-bound)
- Real device QA pass
- Canonical domain decision (vercel.app vs safarenglishka.app)
- `assetlinks.json` real SHA-256 fingerprint
- Apple Team ID for AASA
- Play Console App Links verification
- Data Safety form submission
- Signed release AAB upload
- Final release keystore generation + secure backup

## 5. Local Debug APK Instructions

Run on a machine with Node 22, JDK 21, Android SDK 35:

```bash
git pull
npm ci --legacy-peer-deps
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Helper script: `./scripts/build-apk-local.sh`

## 6. Real Device QA Checklist

| # | Area               | Pass Criteria                                       |
| - | ------------------ | --------------------------------------------------- |
| 1 | Cold start         | < 2.5s to first paint                               |
| 2 | Splash             | Hides ≤ 1.5s, no theme flash                        |
| 3 | Offline launch     | Shell loads, offline banner visible                 |
| 4 | Login / resume     | Session rehydrates, no logout flash                 |
| 5 | Keyboard screens   | CTA stays above keyboard                            |
| 6 | Safe area / notch  | No overlap, `--sab` respected                       |
| 7 | Android back btn   | Modal → previous route → exit prompt                |
| 8 | PDF viewer         | Opens, scrolls, FLAG_SECURE on                      |
| 9 | Video player       | Plays, fullscreen, orientation lock                 |
| 10| Downloads          | Save/open works, persistent                         |
| 11| Razorpay           | Native sheet on device                              |
| 12| Deep link cold     | URL opens correct route from killed state          |
| 13| Deep link warm     | URL routes without restart                          |
| 14| External links     | Open in system browser, no leak                     |
| 15| Force-update gate  | Gracefully blocks old build                         |
| 16| Dark mode toggle   | No flash, status bar updates                        |
| 17| Logout             | Clears session, returns to login                    |
| 18| Network flap       | Recovers, queued mutations replay                   |

## 7. Do-Not-Touch Rules (Freeze)

- ❌ Do **not** loosen bundle budgets (220 KB entry / 300 KB chunk)
- ❌ Do **not** commit a fake SHA-256 to `assetlinks.json`
- ❌ Do **not** commit a fake Apple Team ID to AASA
- ❌ Do **not** switch canonical domain until final decision
- ❌ Do **not** bypass the `check-bundle-size` gate
- ❌ Do **not** blindly replace PWA / OG / 3D / splash assets
- ❌ Do **not** enable `CAP_DEBUG=1` in release builds
- ❌ Do **not** add cleartext (`http://`) URLs
- ✅ Every new feature: rerun `npm run build`, verify entry ≤ 220 KB, chunk ≤ 300 KB

## 8. Next Actions When Launch Is Near

1. Decide canonical domain (vercel.app vs custom)
2. Generate release upload keystore; back up securely (1Password / secure vault)
3. Extract SHA-256 via `keytool -list -v -keystore upload.keystore` → patch `public/.well-known/assetlinks.json`
4. Add CI secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
5. `./gradlew bundleRelease` → signed AAB
6. Real device QA (table in §6) — all 18 items pass
7. Play Console: create app, App Links verification, Data Safety form, content rating
8. iOS path: real Apple Team ID → AASA → Xcode signing → TestFlight
9. Internal testing track → closed testing → production

---

**Freeze verdict:** Architecture is production-grade. Hold release-credential work until publish decision. Resume from §8 when ready.
