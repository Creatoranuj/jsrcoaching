# Workflow E2E audit — 2026-07-23

Skills: **capacitor-ci-cd** + **ci-e2e-error-monitor**
Harness: `bash scripts/e2e/audit-workflows.sh` (YAML parse + actionlint + shellcheck + signature scan + Maestro flow parse).

## Static verdict — all 11 workflows clean

| Check | Result |
|---|---|
| YAML parse (11 files) | ✅ all pass |
| actionlint | ✅ 0 errors |
| shellcheck (via actionlint) | ⚠️ 4 style/info only (SC2129, SC2086, SC2034) — non-blocking |
| S1 (pipefail-in-dash) | ✅ none |
| S2 (artifact@v≤5) | ✅ none — all `@v6`/`@v8` |
| S3 (MAESTRO_* env wired) | ✅ every use site has the env block |
| Maestro flow parse (7 flows) | ✅ all pass |

**Conclusion:** the `signed-apk-smoke` "exit code 1" is **not** a config/syntax bug I can see from the repo. It is a runtime failure (assertion, gradle, or emulator) that only the failing run log names.

## Suspects ranked (need the run log to confirm)

| # | Step | Signature | Why plausible | Fix if confirmed |
|---|---|---|---|---|
| 1 | `maestro test maestro/smoke.yaml` (line 500) | **S9** — assertion timeout | Dashboard tokens (`Quick Actions|All Classes|…`) not visible within 120s → exit 1 after retry | Widen tokens in `maestro/smoke.yaml:110` or fix post-login route |
| 2 | `Write smoke script` (line 247) | **S3** — empty `MAESTRO_EMAIL`/`PASSWORD` | Secret unset → step exits 1 with `::error::` | Set both repo secrets |
| 3 | `Decode signing keystore` (line 157) | keystore-missing | `KEYSTORE_BASE64` unset → exit 1 | Set 4 keystore secrets |
| 4 | `Build signed release APK` (gradle) | R8/proguard/manifest merge | ProGuard regression after Capacitor bump | Read `gradle-build-reports-signed-*` (uploaded on failure) |
| 5 | `run_api35_split_smoke` | Android 15 driver flake | Only API 35 (advisory, `continue-on-error`) | Not blocking |
| 6 | Cold-boot perf gate (line 642) | boot > 120s | Fires when `Displayed` > 120s | Bump budget or fix cold-boot |

**Fast triage:** the failing run always uploads `signed-smoke-logcat-api33-maestro1.39.0` (contains `flake-telemetry.json` with `failure_class` + `first_fail_assertion`) and `gradle-build-reports-signed-*` (on gradle failure). One JSON download names the exact suspect.

## Local reproduction environment

`scripts/e2e/audit-workflows.sh` runs all four static checks in ~2s with no network.

Catches locally: YAML errors, actionlint, shellcheck, S1/S2/S3 signatures, Maestro flow syntax.
Cannot catch locally (needs runner): assertion timeouts vs signed APK, gradle/R8 regressions, real Supabase login.

## What I need to close this

- The failing run's `flake-telemetry.json` (download from `signed-smoke-logcat-*` artifact) — fastest.
- OR last 50 lines of the failing step log.

Without one, any workflow edit is a guess.
