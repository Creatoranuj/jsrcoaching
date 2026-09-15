---
name: capacitor-bun-apk-build
description: Build an errorless Android debug APK for this Bun + Capacitor project in GitHub Actions and locally. Use when the user asks to build/release the APK, fix CI build failures, address Node 20 deprecation warnings, Gradle/AGP warnings, cache restore failures, or harden `.github/workflows/build-apk.yml`.
---

# Capacitor + Bun Debug APK Build Workflow

This project's CI is `.github/workflows/build-apk.yml`. It runs on push of `v*` tags and `workflow_dispatch`. Local mirror: `scripts/build-apk-local.sh`.

Stack pins (do NOT drift):
- Node 24, Bun (oven-sh/setup-bun@v2), JDK 21 Temurin, Android SDK 35, Gradle 8.11.1, AGP-compatible build-tools, Capacitor 6.x.
- App id `com.naveenbharat.app`. `versionName` must be numeric — see `android/app/build.gradle` (it strips non-numeric chars; never feed it `main` / `v1.0`).
- Install with `--legacy-peer-deps --no-audit --no-fund`. Bun is used for fast install; `npx cap sync` still runs through Node.

## Canonical build order

1. Clean old artifacts (quota) → checkout (`fetch-depth: 1`) → set numeric `APP_VERSION_NAME`.
2. `actions/setup-node@v4` (node 24) + `oven-sh/setup-bun@v2`.
3. `bun install --no-save` OR `npm install --legacy-peer-deps --no-audit --no-fund`.
4. `npx tsgo --noEmit -p tsconfig.app.json` (never `tsc`).
5. `npm run build` → `npx cap sync android`.
6. `chmod +x android/gradlew` → `cd android && ./gradlew assembleDebug --no-daemon --parallel --build-cache`.
7. APK smoke check (verify MainActivity + `@capacitor/app` plugin class present) → `actions/upload-artifact@v4` → `softprops/action-gh-release@v2`.

## Diagnosing the “2 warnings” the user keeps seeing

These are **non-blocking annotations**, not build failures. Do not rewrite the workflow over them.

### 1. "Node.js 20 is deprecated … forced to run on Node.js 24"

- Cause: `actions/checkout@v4`, `actions/cache@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`, `softprops/action-gh-release@v2` still ship a `node20` runtime in their `action.yml`.
- We already set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"` at workflow `env`. GitHub honors it → actions execute on node24 → only a soft annotation remains.
- Do NOT pin to pre-release `@vNEXT`/`@main` tags to "fix" this — that breaks reproducibility. Wait for the upstream `v5`/`v6` GA releases (tracked at https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/). When they ship, bump in this exact order: checkout → setup-node → cache → upload-artifact → action-gh-release, one PR each.

### 2. "Cache Android SDK platform + build-tools — Failed to restore: '/usr/bin/tar' failed with exit code 2"

- Cause: cache **miss** on a cold cache key (first run after key change, or the runner image rotated). `actions/cache@v4` shells out to `tar` and surfaces the miss as a scary warning.
- Safe to ignore — the next step re-downloads the SDK component. Confirm by greping the log for `Cache not found for input keys` near the same timestamp.
- Only act if it repeats every run with a stable key: then the cache **save** step is failing (usually because the path is empty). Verify `$ANDROID_HOME/platforms/android-35` and `$ANDROID_HOME/build-tools/35.0.0` exist before the cache step.

## Other recurring non-failures — leave alone

| Annotation | Why it’s safe |
|---|---|
| `Using flatDir should be avoided` | Required by `capacitor-cordova-android-plugins` (see comment in `android/app/build.gradle`). Removing breaks Cordova bridge. |
| `android.defaults.buildfeatures.buildconfig=true is deprecated` | AGP 9 forward-warning. Already opted out via `buildFeatures { buildConfig = false }`. |
| `DEP0040 punycode` / `DEP0169 url.parse` | Inside `gh` CLI and node internals — not our code. |
| `Deprecated Gradle features … incompatible with Gradle 9.0` | Comes from Capacitor plugin Gradle scripts upstream. Track Capacitor 7 migration; don't patch plugin sources. |
| `gh: Resource not accessible by integration (HTTP 403)` in cleanup step | Repo-scoped token can't list artifacts cross-org. Step is wrapped in `continue-on-error: true`; harmless. |

## Real failure triage checklist

When the workflow truly fails, follow this order — do NOT bisect blindly:

1. **Find the failing step**: download the raw log, `grep -n "##\[error\]\|FAILURE: \|BUILD FAILED\|error:"`.
2. **Gradle failure** → look at the workflow's "❌ Gradle failed" group (last 200 lines). Common causes:
   - `Could not resolve` → npm/Bun install ran but `node_modules/@capacitor/*/android` is missing → re-run `npx cap sync android`.
   - `versionName ... is not a valid` → `APP_VERSION_NAME` env contained `main` or empty. Fix the tag/dispatch input.
   - `R8: Missing class` → add to `android/app/proguard-rules.pro`.
   - OOM (`GC overhead`) → bump `GRADLE_OPTS` to `-Xmx6g`.
3. **TypeScript error** → run `bun x tsgo --noEmit -p tsconfig.app.json` locally; never disable the typecheck step.
4. **APK smoke check failed** → a Capacitor plugin didn't get bundled. Re-run `npx cap sync android` and confirm `android/app/src/main/assets/capacitor.plugins.json` lists it.
5. **Artifact upload "quota exceeded"** → cleanup step at the top of the workflow handles this; if it's still tripping, lower the retention from 3 → 1 most-recent.

## Edits you may make

- Bump action versions ONLY to GA majors. One action per PR. After bumping, run a `workflow_dispatch` build before tagging a release.
- Adding a new Capacitor plugin: `bun add @capacitor/<plugin>` → `npx cap sync android` → commit `android/capacitor.settings.gradle` + `android/app/capacitor.build.gradle` changes → push.
- New permission: edit `android/app/src/main/AndroidManifest.xml`, not the workflow.

## Edits you must NOT make

- Don't remove `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`.
- Don't add `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` — that's the OPPOSITE direction.
- Don't change `--no-daemon`. CI runners are cold; the daemon costs more than it saves.
- Don't enable `minifyEnabled` for debug — see comment in `android/app/build.gradle` (R8 strips Capacitor plugin classes).
- Don't switch the workflow to npm if Bun cache is healthy, or vice versa, "to fix" a transient install error. Retry first.

## Local repro

```bash
./scripts/build-apk-local.sh
# requires: node 22+/24, JDK 21, ANDROID_HOME with SDK 35 + build-tools 35.0.0
```

APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Install: `adb install -r <path>`.
