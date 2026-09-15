# Git & CI/CD Audit — v1.5.1

Date: 2026-09-12
Repository: `mahiyadav-26/Sadguruclasses`
Base commit audited: `8e88a03` (docs: add v1.5.0 release audit)

## 1. Repository state

| Item | Value |
| --- | --- |
| Default branch | `main` |
| Latest commit | `8e88a03ba5f0b5c40a2adea46c456cfda74a8af3` |
| Commit signing | Not enabled (unsigned commits) |
| Previous release | `v1.5.0` (published, targets `main`) |
| Release assets | `Sadguruclasses.apk` (30.9 MB, SHA-256 `96c49603…c48`), AAB, web bundle |

## 2. Workflow inventory (15 active)

`build-apk`, `code-guards`, `dependency-audit`, `enrollment-bypass`,
`flake-trend-aggregator`, `lighthouse-ci`, `maestro-android`, `migration-drift`,
`pdf-proxy-keepalive`, `playwright-e2e`, `razorpay-smoke`, `signed-apk-smoke`,
`supabase-keepalive`, `typecheck-build`, `unit-tests`.

### Status on latest `main`

| Workflow | Latest conclusion |
| --- | --- |
| Typecheck & Build | success (`34674102755`) |
| Unit Tests / Coverage | success |
| Playwright E2E | success |
| Code Guards | success |
| Enrollment Bypass Regression | success (run #58, `8ea8156`) |
| Migration Drift | success (informational) |
| Maestro Android E2E | **failure** — fixed in this release |
| Supabase Keepalive | **failure** — fixed in this release |

The 38 historical failed runs are dominated by these two scheduled workflows plus
older iterations of the enrollment regression job, which now passes on `main`.

## 3. Root causes found and fixed

### 3.1 Supabase Keepalive (every 5 days, opens an alert issue on failure)

The step read `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`. Neither secret
exists in the repository — only `VITE_SUPABASE_PUBLISHABLE_KEY` is configured.
The ping therefore aborted before making any request and filed a false alert
issue on every schedule.

Fix (two parts): the workflow now also falls back to
`VITE_SUPABASE_PUBLISHABLE_KEY`, and the pass condition was corrected. The
PostgREST root answers `401 Only the service_role API key can be used for this
endpoint` to publishable/anon keys — a live response that the old strict 2xx
check treated as an outage. The check now fails only on `000` (unreachable) or
`5xx`, which is what a paused project actually returns.
Verified: manual run on `405bb8cb` completed **success**.

### 3.2 Maestro Android E2E (nightly)

`./gradlew assembleDebug` failed within one second on the `macos-14` runner.
GitHub macOS images do not ship the Android SDK, so Gradle could not resolve an
SDK location. The Ubuntu-based `build-apk` workflow installs the SDK explicitly,
which is why release builds kept working.

Two distinct causes, both fixed:
1. GitHub macOS images ship no Android SDK → added
   `android-actions/setup-android@v3` (platform-tools, android-35,
   build-tools 35.0.0) before the Gradle step.
2. `android/gradlew` is not committed with the executable bit, so the next run
   failed with `./gradlew: Permission denied` → the step now runs
   `chmod +x ./gradlew` first (the Ubuntu release workflow already did this,
   which is why release builds never hit it).
Verified: on `476406a4` the debug APK build step completes **success** and the
emulator/Maestro stage now runs.

## 4. Secrets configured (14, names only)

Signing (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`),
Sentry (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `VITE_SENTRY_DSN`),
Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_PUBLISHABLE_KEY`), and E2E test accounts (`TEST_USER_EMAIL`,
`TEST_USER_PASSWORD`, `TEST_PAID_COURSE_ID`).

Razorpay live credentials live in Supabase Edge Function secrets only; the CI
smoke test intentionally stays on `rzp_test_` keys.

## 5. Ratings

| Area | Rating |
| --- | --- |
| GitHub automation coverage | 5 / 5 |
| CI reliability (after these fixes) | 4.8 / 5 — pending one clean nightly/scheduled run |
| Release hygiene (tags, assets, checksums) | 5 / 5 |
| Supply-chain (signed commits, pinned actions) | 4 / 5 — commit signing not enabled |
| Overall project | 4.9 / 5 |

## 6. Remaining open items

1. Leaked-password protection is still OFF in Supabase Auth (owner-only toggle).
2. Commit signing is not enabled on the repository.
3. Migration-drift CI remains informational; flip to blocking after a clean run.
4. Confirm the next scheduled keepalive and nightly Maestro runs turn green.
