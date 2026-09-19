# JSR Coaching — Git Release + APK Pipeline Audit (2026-09-19)

**Verdict: PASS — 5/5. CRITICAL: 0, HIGH: 0.** Release tag `v1.8.4` cut on `b829f6e`.

## A. Local compile chain (all executed, all green)

| Step | Command | Result |
| --- | --- | --- |
| Typecheck | `tsc --noEmit` | clean, 0 errors |
| Build | `bun run build` | ✓ 8.68s, 0 warnings |
| Android sync | `npx cap sync android` | ✓ 0.87s, 19 plugins resolved |
| Unit/integration tests | `vitest run` | 723 passed, 6 skipped, 0 failed (80 files) |
| Bundle budget | `scripts/check-bundle-size.mjs` | initial entry 117.0KB gz / budget 180KB — OK |
| Design tokens | `scripts/check-design-tokens.mjs` | 124/172 — OK |
| Console usage | `scripts/check-console-usage.mjs` | 105/141 — OK |
| Tap targets | `scripts/check-tap-targets.mjs` | 43/43 — OK |
| Lockfile registry | `scripts/check-lockfile-registry.mjs` | public npm only — OK |
| Capacitor peers | `scripts/verify-capacitor-deps.mjs` | compatible with core ^7.6.5 — OK |
| PNG budget | `scripts/check-png-sizes.mjs` | OK (30KB budget) |

### Bundle composition (gzip)
index 53.0KB (entry) · vendor-supabase 53.5 · vendor-radix 47.7 · vendor-md 44.2 · vendor-react 43.7 · vendor-motion 39.4.
Heavy chunks are all **lazy, outside the entry graph**: html2pdf 256KB (Save-as-PDF only, cap 300KB), vendor-sentry 150.7, vendor-pdf 119.5, vendor-charts 110.2.
No duplicate vendor copies, no chunk regression.

## B. APK / AAB build correctness (`android/app/build.gradle`)

- `applicationId com.jsrcoaching.app`; debug gets `.debug` suffix + `-debug` versionName → a QA install can never signature-clash with production. (Root cause of the 2026-09-17 "package appears to be invalid" — fixed and guarded by comment.)
- `versionName` forced numeric from `APP_VERSION_NAME`, regex-stripped → ForceUpdateGate comparison can never see `main`/`v1.0`.
- `versionCode` from `GITHUB_RUN_NUMBER` → monotonic, Play-Store safe.
- Signing: v1 + v2 + v3 all enabled (OEM sideload installers still need v1). Keystore injected from secrets only; no credential in the repo.
- Release: `minifyEnabled true` + `shrinkResources true` + proguard rules (55 lines). Debug deliberately unminified (AGP disables real R8 for debuggable anyway) → saves ~25s with no loss.
- Size hygiene: `ignoreAssetsPattern` strips all `*.map` (331 sourcemaps, ~28MB) and the pdf.js demo PDF; ABI limited to arm64-v8a + armeabi-v7a (−12-18MB), CI emulator overrides via `ANDROID_ABI_FILTERS`.
- AAB: language/density/ABI splits enabled → smallest Play delivery.
- Razorpay SDK pinned exactly (`com.razorpay:checkout:1.6.41`) — no dynamic `1.6.+` drift on UPI behaviour.
- Permissions: only 7, all justified (INTERNET, VIBRATE, CAMERA, READ_MEDIA_IMAGES, READ/WRITE_EXTERNAL_STORAGE, POST_NOTIFICATIONS). No location, no contacts, no phone state.

## C. Release workflow (`.github/workflows/build-apk.yml`)

- `runs-on: ubuntu-24.04` (pinned; immune to the Oct 19 2026 `ubuntu-latest` migration). Actions on GA majors: checkout@v7, setup-node@v7, setup-java@v5, cache@v6, upload-artifact@v6, setup-android@v4 → **no Node-20 deprecation warning left**.
- Version integrity gate: tag vs `versionName` mismatch **fails the build**; dispatch builds get a unique `v1.0-<date>-<run>` tag so two builds in the same minute can't collide.
- Sourcemap defence in depth — three separate gates: dist strip + reference check, assets/public check after copy, and an APK-content check that fails on a single packaged `.map`. Sentry gets uploaded copies instead.
- Signed artifacts verified post-build by `scripts/verify-apk-release.sh`; SHA-256 published alongside APK and AAB.
- Both `:app:assembleRelease` and `:app:bundleRelease` produced; APK + AAB + sha256 + Gradle logs uploaded; Play Store upload step available.
- Sentry release stamped `com.jsrcoaching.app@<version>+<run>` → crash reports map to an exact build.

## D. Known benign annotations (do not "fix")
`flatDir should be avoided` (required by Cordova bridge) · `buildconfig deprecated` (already opted out) · Gradle 9 forward-warnings from Capacitor plugin scripts · cross-org artifact cleanup 403 (`continue-on-error`).

## Findings
**CRITICAL: none. HIGH: none. MEDIUM: none.**
LOW (cosmetic): `npm run guard:all` still only chains design+console — the tap-target guard runs in CI but not in that alias. No release impact.

## Rating
| Lane | Score |
| --- | --- |
| Compile / typecheck / tests | 5/5 |
| Bundle size & code-splitting | 5/5 |
| APK/AAB build config & signing | 5/5 |
| Release workflow & supply chain | 5/5 |
| Permissions & secret hygiene | 5/5 |

**FINAL: 5/5 — RELEASE APPROVED.** Owner-side items unchanged: leaked-password toggle, on-device video-pause check, live Rs.1 payment test.
