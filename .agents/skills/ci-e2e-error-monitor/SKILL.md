---
name: ci-e2e-error-monitor
description: Diagnose and fix failures in the Maestro (android-emulator-runner) and Playwright E2E GitHub Actions workflows for the Naveen Bharat APK. Use whenever a CI run is red, an Actions annotation appears ("The process '/usr/bin/sh' failed with exit code 2", "Node.js 20 is deprecated", emulator boot/adb offline, Playwright webServer/browser errors), the user pastes a workflow log, or asks to "monitor", "watch", or "find the exact solution" for Maestro / Playwright / E2E errors. Maps each failure signature to its exact root cause and one-line fix.
---

# CI E2E Error Monitor — Maestro + Playwright

A signature → root-cause → exact-fix lookup table for the two device/E2E pipelines:
- `.github/workflows/maestro-on-apk.yml` (chains after "Naveen Bharat" build; API 26/30/34 emulator matrix)
- `.github/workflows/playwright.yml` (PR + push to main; Chromium-only projects)

Maestro flows live in `maestro/*.yaml`; Playwright specs in `e2e/*.spec.ts`.
When invoked, **read the actual workflow file and the failing log first**, match the
signature below, apply the exact fix, then re-validate with the audit checklist.

## Workflow: how to diagnose

1. **Identify the failing step** from the Actions annotation or log (`##[error]` line).
2. **Grep the log** for the fatal marker, not the noise:
   `grep -nE "##\[error\]|failed with exit code|Illegal option|Error:|Timed out|ECONNREFUSED|assertion failed" <log>`
   Emulator boot noise (`adb: device offline`, `Failed to process .ini`, transient
   `getprop sys.boot_completed` retries) is **benign** — never chase it. The real
   failure is the last `##[error]` before "Terminate Emulator".
3. **Match the signature** in the table below.
4. **Apply the exact fix** to the workflow / flow / spec.
5. **Validate** against the checklist. Confirm YAML parses:
   `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <file>`

## Signature → Exact Fix table

### S1 — `/usr/bin/sh: 1: set: Illegal option -o pipefail` → exit code 2 (CRITICAL, Maestro)
**Root cause:** `reactivecircus/android-emulator-runner` runs the `script:` under
`/usr/bin/sh`, which on `ubuntu-latest` is **dash**, not bash. `set -o pipefail` is a
bash-only builtin; dash aborts on line 1 *before the emulator work runs*. The step fails
even though the emulator booted (`Boot completed`).
**Exact fix:** first line of the emulator `script:` must be `set -e` (no `-o pipefail`).
If a pipeline's exit status genuinely matters, drop the pipe or wrap the whole block:
`bash -eo pipefail -c '<script>'` (invoke bash explicitly). Never rely on `sh` for pipefail.
**Currently applied** in `maestro-on-apk.yml` (`set -e`) — keep it; do not "restore" pipefail.

### S2 — `Node.js 20 is deprecated ... actions/upload-artifact@v5, download-artifact@v5` (WARNING → will break)
**Root cause:** artifact actions pinned to v5 run on Node 20, now force-migrated to Node 24
and slated for removal. Shows as an Actions annotation (warning today, hard-fail later).
**Exact fix:** bump to node24 majors — `actions/upload-artifact@v6`, `actions/download-artifact@v8`.
Verify sibling actions already on node24: `checkout@v5`, `setup-node@v5`, `setup-java@v5`,
`cache@v5`, `oven-sh/setup-bun@v2`. Grep all workflows: `rg "artifact@v[0-9]" .github/workflows`.

### S3 — Maestro `smoke.yaml` fails at "Sign in" → "Dashboard" on every matrix leg
**Root cause:** `${MAESTRO_EMAIL}` / `${MAESTRO_PASSWORD}` resolve to empty strings because
the repo secrets are unset (or the `env:` block is missing on the emulator step). Login
submits blank creds; the Dashboard assertion times out on all of API 26/30/34.
**Exact fix:** ensure the emulator-runner step has `env: { MAESTRO_EMAIL: ${{ secrets.MAESTRO_EMAIL }}, MAESTRO_PASSWORD: ${{ secrets.MAESTRO_PASSWORD }} }`
and both secrets exist in repo settings. Never hardcode creds in `maestro/*.yaml` (committed).

### S4 — `No APK found in downloaded artifacts` (Maestro, Locate APK step)
**Root cause:** the parent "Naveen Bharat" build did not upload under the expected
`naveen-bharat-apk-*` name, or `download-artifact` lacked `run-id` + `github-token` to reach
the parent `workflow_run`.
**Exact fix:** keep `pattern: naveen-bharat-apk-*`, `merge-multiple: true`,
`run-id: ${{ github.event.workflow_run.id || inputs.run_id }}`, `github-token: ${{ secrets.GITHUB_TOKEN }}`.
Confirm the parent build's upload step name matches the pattern.

### S5 — Emulator never boots / `Timeout waiting for emulator to boot` (Maestro)
**Root cause:** cold boot on a Linux runner without HW accel is slow; default timeout too low,
or KVM missing.
**Exact fix:** keep `emulator-options: -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim`,
`disable-animations: true`, and rely on the AVD cache job. Boot legitimately takes ~60–70s
(`Boot completed in 68032 ms` is normal). Raise `emulator-boot-timeout` only if it truly times out.

### S6 — Playwright `webServer` failed / `ECONNREFUSED 127.0.0.1` on start
**Root cause:** `bun run build` didn't produce servable assets, or the webServer command/port
in `playwright.config.ts` doesn't match what `npm run start` serves.
**Exact fix:** ensure the "Build web assets" step (`bun run build`) precedes the test step and
`playwright.config.ts` `webServer.url`/`port` matches `server/index.js`. Pin Node via `.nvmrc`
(`node-version-file: '.nvmrc'`) so build + server run on the app's Node.

### S7 — Playwright `browserType.launch: Executable doesn't exist` (Firefox/WebKit)
**Root cause:** CI installs Chromium only (`playwright install chromium`) but the run invokes
every configured project, including Firefox/WebKit.
**Exact fix:** restrict to Chromium projects: `--project=chromium --project=mobile-chrome --project=android-pixel7`.
Keep the CI spec list to release-safe specs; legacy admin/auth/payment specs use demo creds and
must not gate every push.

### S8 — Playwright `@playwright/test` missing / `playwright: not found`
**Root cause:** dependency not declared, or `bun install --frozen-lockfile` ran against a stale lock.
**Exact fix:** keep the "Verify @playwright/test is declared" guard step; if it fires, run
`bun add -d @playwright/test` and commit the lockfile. Then `./node_modules/.bin/playwright install --with-deps chromium`.

### S9 — Maestro flow flakes: `Element not found` / assertion timeout mid-flow
**Root cause:** real device timing — element not yet rendered, or animations not fully disabled.
**Exact fix:** add per-step `timeout:` on `assertVisible`, keep the three `settings put global *_animation_scale 0`
adb calls, and mark genuinely optional steps `optional: true` (as `pdf-back.yaml` / `offline-queue.yaml` do).
Don't blanket-`optional` assertions that guard the regression the flow exists to prove.

### S10 — `set -o pipefail`-style "Illegal option" in ANY step (generalization of S1)
**Root cause:** any GitHub Actions `run:`/`script:` block that assumes bash but executes under
`sh`/dash. Also affects `[[ ]]`, `source`, arrays, `local` outside functions.
**Exact fix:** either start the block with `set -e` (dash-safe) and use POSIX syntax, or add
`shell: bash` to the step (for standard `run:` steps). Note: `android-emulator-runner`'s `script:`
does **not** honor `shell:` — it always uses `sh`, so keep that script POSIX + `set -e`.

### S11 — Maestro job reports green but `smoke.yaml` actually failed (SILENT REGRESSION)
**Root cause:** the smoke test line was wrapped in `|| echo "smoke failed"` (or `|| true`),
so a non-zero exit from `maestro test` gets swallowed. The job turns green while login /
dashboard / core flow is broken on every emulator leg. Only obvious signal is the
`maestro-report.xml` artifact showing `<failure>` inside a "successful" run.
**Exact fix:** the smoke flow is the gate — it must propagate exit code. Remove `|| echo`
/ `|| true` from `maestro test maestro/smoke.yaml ...`. Keep secondary flows
(`pdf-back.yaml`, `back-button-cold-start.yaml`, `offline-queue.yaml`) as `|| true` because
they cover optional paths that flake on cold emulators. Add a comment on the smoke line
explaining why it must hard-fail so a future edit doesn't "restore" the swallow.
**Detect:** `rg -n 'maestro test.*smoke.*\|\| (echo|true)' .github/workflows` should return zero.

## Anti-patterns to flag loudly

- Re-adding `set -o pipefail` to the emulator `script:` — reintroduces S1.
- Pinning artifact actions back to v5 — reintroduces S2 (and future hard-fail).
- Hardcoding `MAESTRO_EMAIL`/`MAESTRO_PASSWORD` in committed `maestro/*.yaml`.
- Running all Playwright projects in CI when only Chromium is installed (S7).
- Chasing benign emulator boot warnings (`adb: device offline`, `.ini` warnings) as the cause.
- Removing the `@playwright/test` guard step (S8 goes silent until runtime).

## Audit checklist (run after any CI edit)

1. Every emulator `script:` starts with `set -e`, never `set -o pipefail`. (S1/S10)
2. No `artifact@v5` anywhere: `rg "artifact@v[0-9]" .github/workflows` → only v6/v8. (S2)
3. Emulator step carries the `MAESTRO_EMAIL`/`MAESTRO_PASSWORD` `env:` block. (S3)
4. `download-artifact` has `pattern`, `run-id`, `github-token`. (S4)
5. Playwright run lists only `--project=chromium/mobile-chrome/android-pixel7`. (S7)
6. `@playwright/test` guard + `playwright install --with-deps chromium` present. (S8)
7. All touched YAML parses: `python3 -c "import yaml; yaml.safe_load(open(F))"`.
8. Two workflow trees exist (`.github/workflows/` and `safarenglishka/.github/workflows/`) — apply the same fix to both when the file exists in each.

## Done when

- The failing signature is matched to a table row and the exact fix is applied.
- The audit checklist passes and YAML validates.
- Closing reply names the skill: "Used the ci-e2e-error-monitor skill."
