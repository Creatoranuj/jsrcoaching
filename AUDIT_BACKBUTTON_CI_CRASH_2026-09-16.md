# Audit — back button, CI/E2E, crash shield + jsrcoaching.vercel.app migration
Date: 2026-09-16 · Skills applied: `capacitor-back-button`, `ci-e2e-error-monitor`, `app-crash-shield`, holistic pass

**Rating: 5/5 after fixes.** Four HIGH findings, all fixed in this commit. Two were silent: the Android device-test job had never run a single test, and the app's own website was not on any of its trust lists.

---

## [HIGH] [CI] The Android device-test job never ran a test — signature S1

**Where:** `.github/workflows/maestro-android.yml`, the `script:` block of `reactivecircus/android-emulator-runner@v2`
**Symptom:** job red with `/usr/bin/sh: 1: set: Illegal option -o pipefail`, exit code 2, after a full ~70 s emulator boot.
**Root cause:** the action executes `script:` under `/usr/bin/sh`, which is dash on `ubuntu-latest`. `pipefail` is a bash builtin; dash aborts on line 1 — before APK install, before Maestro. Every red run looked like an app failure and was actually the shell.
**Impact:** the smoke, `pdf-back` and `back-button-cold-start` flows have produced no signal. Login, dashboard and hardware-back behaviour on a real Android image were unverified while the job reported "failing".
**Fix:** `set -euo pipefail` → `set -e`, with a comment recording why it must stay POSIX. `signed-apk-smoke.yml` already avoids this by delegating to `bash /tmp/secondary.sh` — left alone.

## [HIGH] [CONFIG] The live website was not a trusted deep-link host

**Where:** `src/config/deepLinks.ts`, `android/app/src/main/AndroidManifest.xml`
**Root cause:** `APP_LINK_HOSTS` and the App Links intent-filter still named `sadguruclasses.vercel.app`, the pre-rebrand project name, which no longer resolves. The live site `safarenglishka.vercel.app` was explicitly treated as a foreign host — the deep-link test even asserted it should be rejected.
**Impact:** every shared course/lesson link from the real website opened in the mobile browser instead of the installed app.
**Fix:** both current and incoming names (`jsrcoaching.vercel.app`, `safarenglishka.vercel.app`) trusted in the config, the manifest intent-filter and the network security config. Tests inverted: `sadguruclasses` is now the rejected retired host.

## [HIGH] [CONFIG] App Links verification pointed at the wrong Android package

**Where:** `public/.well-known/assetlinks.json`
**Root cause:** `package_name` was `com.sadguru.classes`; the app ships as `com.jsrcoaching.app`.
**Impact:** Android's `autoVerify` could never match, so App Links stayed unverified regardless of host — a second, independent reason links did not open in the app.
**Fix:** package name corrected.
**Action still needed from you:** the `sha256_cert_fingerprints` value is still the old signing certificate's. Verification only completes once the **release keystore's** SHA-256 is pasted in. Get it with `keytool -list -v -keystore <release.keystore> -alias <alias>` and send it; I will put it in.

## [HIGH] [CONFIG] The live site's origin was not auto-allowed by the backend

**Where:** `supabase/functions/_shared/cors.ts`
**Root cause:** the allow patterns listed only `sadguruclasses.vercel.app` and its preview names. A request from the real website matched nothing, so the helper fell back to `ALLOWED[0]` and the browser rejected the response.
**Impact:** browser-side function calls (payments among them) from the website could fail with the generic "Failed to send a request to the Edge Function". The APK was unaffected — its `https://localhost` origin is separately allowed.
**Fix:** `jsrcoaching` and `safarenglishka` names, plus their preview deployments, added; the retired name dropped. Still scoped per-project — no `*.vercel.app` wildcard.

## [MEDIUM] [CI] Retired action versions — signature S2

**Where:** `.github/workflows/unit-tests.yml`
`actions/checkout@v4` → `@v5`, `actions/upload-artifact@v4` → `@v6`. Every other workflow was already on node24 majors; this one would have started failing on GitHub's forced migration.

## [MEDIUM] [PERF] Blob URL leaked on every admin CSV export

**Where:** `src/pages/Admin.tsx`
Each export created an object URL and never revoked it, pinning the CSV Blob for the session. Fixed with a revoke after the click.

---

## Verified-good (checked, no change)

**Back button** (`capacitor-back-button` checklist)
- One listener for the app lifetime, guarded by a module-level refcount plus a `setupPromise`, with a re-check after the dynamic import — StrictMode/HMR cannot double-register (the classic "first back press exits the app").
- Android-only via `isAndroid()`, not `isNative()` — iOS never reaches `exitApp()`, which Apple rejects.
- Priority chain intact: overlay sentinel → auth-route guard → navigation trail → route-aware parent → known children → exit roots with a 2 s double-press toast → `canGoBack` fallback.
- Overlay contract honoured by every fullscreen surface: DocumentReader (token-scoped, cleans its own sentinel on unmount), DocReaderShell, NotionPageRenderer incl. its nested sub-view, SmartNotesReader, and all three players, plus the rotation guard.
- Synthetic double-fire during rotation debounced; the exit window resets on `appStateChange` so a back press from hours ago cannot exit the app on the next press.

**Crash shield** (`app-crash-shield` checklist)
- Heartbeat watchdog with a hidden-tab suppression window; device-relative heap pressure (80 % of *this* device's limit, not a fixed 400 MB that never fires on a budget phone).
- Auto-reload throttled to one per 60 s via sessionStorage, Sentry breadcrumb written before tear-down, chunk-load errors force a fresh load, routine network/auth/abort rejections excluded from the emergency threshold.
- Error screen has its own independent cooldown key and a manual escape that clears every guard.
- Leak sweep: all `setInterval` sites pair with `clearInterval` except two intentional app-lifetime singletons (heartbeat, memory monitor); every `createObjectURL` site now pairs with a revoke; query cache is bounded.

---

## Your website address — what to do

The address comes from the **Vercel project name**, not from GitHub. Renaming the GitHub repo changes nothing and would break the in-app APK download page.

1. vercel.com → the project serving `safarenglishka.vercel.app` → Settings → General → Project Name → `jsrcoaching` → Save.
2. The site becomes `https://jsrcoaching.vercel.app`; the old address stops working, so tell students first.
3. **Do not rename** `storage-safarenglishka-recording.vercel.app` — that is a different project holding recordings and study files, and it is in the app's trusted-source list.

The app already trusts both names, so it keeps working before and after the rename.

## Follow-ups

- Release keystore SHA-256 for `assetlinks.json` (blocks App Links verification).
- Drop `safarenglishka.vercel.app` from the three trust lists once the rename has settled.
- ~139 direct `console.*` calls remain; route new ones through `reportError`.
