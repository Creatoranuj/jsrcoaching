# Safar English — Release Pipeline Skill

End-to-end build / release / debug reference for the Capacitor app.

## Phases shipped

| Phase | Delivered |
|------:|-----------|
| 1–3 | Deep links, force-update gate, assetlinks.json, Android intent filters |
| 4 | iOS Universal Links scaffold (AASA), splash fade, `app_config` 1h cache (React Query + localStorage fallback, fail-open) |
| 5 | Capgo OTA workflow scaffold, log-streaming scripts, CI build-log artifacts, this doc |

## Release pipelines

### 1. Web (Vercel)
Push to `main` → Vercel auto-deploys. Hosts `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`.

### 2. Native APK (signed)
- Trigger: push tag `v*` **or** manual `workflow_dispatch`
- Workflow: `.github/workflows/build-apk.yml`
- Output: GitHub Release with `SadguruCoachingClasses-<version>.apk` + `SadguruCoachingClasses.apk` (static URL, plus deprecated `SafarEnglish.apk` alias)
- On failure: `android-build-logs-*` artifact retained 14 days

### 3. OTA live update (Capgo) — scaffold
- Trigger: push to `main`
- Workflow: `.github/workflows/capgo-live-update.yml`
- Silently no-ops until `CAPGO_TOKEN` secret is set in repo Settings
- Auto version bump from Conventional Commits:
  - `feat:` → minor · `fix:` → patch · `BREAKING CHANGE` / `major:` → major
- Commits the bump back with `[skip ci]`
- Activation steps:
  1. Sign up at https://capgo.app, create app for `com.safarenglishka.app`
  2. Add `CAPGO_TOKEN` in GitHub repo Settings → Secrets → Actions
  3. Locally: `npm install @capgo/capacitor-updater && npx cap sync android`
  4. In app boot code, call `CapacitorUpdater.notifyAppReady()`

### 4. Force-update gate (Supabase)
Bump `app_config.min_android_version` (semver string) via SQL or admin UI. Gate fetches once per hour, caches in localStorage, fails open on errors.

## Debugging

### Stream device logs
```bash
./scripts/logs-android.sh   # connected Android device/emulator
./scripts/logs-ios.sh       # booted iOS simulator (requires macOS + Xcode)
```

### Chrome DevTools (Android WebView)
Currently disabled in release for security (`webContentsDebuggingEnabled: false` in `capacitor.config.ts`).

To enable temporarily on a dev branch:
```ts
android: { webContentsDebuggingEnabled: true }
```
Then `npx cap sync android`, install the debug APK, and open `chrome://inspect` on desktop Chrome.

**Do not merge this flag flipped to `true`.**

### Safari Web Inspector (iOS)
iOS WebView debugging works out of the box on debug builds. On the device: Settings → Safari → Advanced → Web Inspector ON. On Mac: Safari → Develop → [device] → [app].

### Deep link testing
```bash
# Android — verify intent filter
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://safarenglishka.vercel.app/dashboard" com.safarenglishka.app

# iOS simulator
xcrun simctl openurl booted "https://safarenglishka.vercel.app/dashboard"
```

## Versioning convention

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: add new dashboard widget` → minor bump
- `fix: correct video player seek` → patch bump
- `feat!: redesign auth` or commit body with `BREAKING CHANGE:` → major bump

The Capgo workflow reads the most recent commit message to decide the bump.

## Out of scope (not yet wired)

- Sentry / Crashlytics (remote crash reporting)
- Bridge message inspector
- iOS native project (`npx cap add ios` must be run locally on a Mac — see `docs/IOS-SETUP.md`)
- `@capgo/capacitor-updater` runtime plugin install

---

## Phase 6 — Security & Performance hardening

### Capsec security scan
Run locally before each release:
```bash
npx capsec scan --severity high
```
Triage all Critical/High findings. Document accepted Medium/Low.

### Android security posture (shipped)
| Setting | Value | File |
|--------|-------|------|
| `usesCleartextTraffic` | `false` | `AndroidManifest.xml` |
| `allowBackup` | `false` | `AndroidManifest.xml` |
| `dataExtractionRules` | excludes all | `res/xml/data_extraction_rules.xml` |
| `networkSecurityConfig` | HTTPS + TLS to Vercel/Supabase | `res/xml/network_security_config.xml` |
| `webContentsDebuggingEnabled` | `false` | `capacitor.config.ts` |
| ProGuard `minifyEnabled` | `true` | `app/build.gradle` |
| `shrinkResources` | `true` | `app/build.gradle` |

### Production console strip
`vite.config.ts` sets `esbuild.drop: ['console', 'debugger']` in `production` mode only. Dev keeps logs.

### Lazy-loading convention
Every page under `src/pages/` MUST be added to `src/App.tsx` as `React.lazy()`. Only `Index`, `Login`, `Dashboard`, `MyCourses` are eager (critical path). The whole `<Routes>` tree is wrapped in `<Suspense fallback={<PageLoader />}>`.

### Image hygiene
All `<img>` tags use `loading="lazy"` + `decoding="async"` except above-the-fold logos (`loading="eager"`).

### Re-running checks
```bash
npx capsec scan --severity high           # security
npm run build && du -sh dist/assets/*.js  # bundle sizes
grep -r "console\.log" dist/ || echo OK   # confirm stripped
```