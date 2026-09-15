# Observer Report — 2026-07-14 — Post packageName-derivation

**Window observed:** last session (P0 → P1 → P2 → warm-up/job-split → packageName derivation)
**Scope:** `.github/workflows/signed-apk-smoke.yml`, `maestro/*.yaml`, Play promote path

## Incomplete
- [ ] **API 28 native crash — still only quarantined**, not fixed — *repeatedly deferred* — evidence: "API 28 stays `experimental: true` + `continue-on-error`" — next action: pull `logcat-crashes.txt` from next red run, extract FATAL EXCEPTION, remove quarantine.
- [ ] **API 35 selector fix unverified on a real tag** — *warm-up/job-split turn* — evidence: "Step 1 (`waitForAnimationToEnd`) shipped but no green run observed yet" — next action: cut a throwaway tag, watch API 35 leg.
- [ ] **P2 promote-to-play never executed end-to-end** — *P2 turn* — evidence: "PLAY_SERVICE_ACCOUNT_JSON unset → soft-skip active" — next action: wait for user to add secret; then dry-run via `workflow_dispatch` with `promote_dry_run=true`.

## Follow-ups deferred
- [ ] **`PLAY_SERVICE_ACCOUNT_JSON` secret** — user-blocked ("jb mai Mere paas Hoga Tb Apply kar Dunga"). Soft-skip guard in place, no code action needed.
- [ ] **Per-API boot thresholds** (raised in earlier senior-architect turn as LOW) — currently one 120s gate for all 3 APIs; API 28 legitimately boots slower.

## Linked to current work
- `ANDROID_PACKAGE` env now derived from `android/app/build.gradle:13` (`applicationId "com.safarenglishka.app"`) ↔ observer flags #1/#2/#3 that repeatedly named hardcoded package as MED-MAINT. **Closed.**
- Retry loop (Step 2) ↔ ci-e2e-error-monitor S9 (flaky element timing) — retry now masks single-attempt flakes; **watch** that it doesn't hide a real regression (no flake-rate metric yet).

## Dropped
- **Flake-rate telemetry** — mentioned once ("retry loop hides flakiness metrics"), never implemented. Not urgent but real observability gap.

## Risks / ignored findings
- **`experimental: true` on API 28** — accepted because: no logcat yet to root-cause; keeps tag-gate unblocked. Risk: real Android 9 regressions ship silently until a user reports.
- **`r0adkll/upload-google-play` pinned to SHA** ✅ — no risk, noted for completeness.
- **Warm-up `monkey` launch swallows exit code** (`|| true`) — accepted because launcher intent sometimes returns non-zero on cold start; risk: masks a genuinely un-launchable APK. Mitigated by the Maestro flow itself asserting Dashboard.

## Signal-only (nothing to do)
- 3 jobs (`smoke-signed-apk`, `secondary-flows`, `promote-to-play`) all pass YAML validation.
- Zero `com.safarenglishka.app` string literals remain in `.github/workflows/signed-apk-smoke.yml`.
- Emulator `script:` still starts with `set -e` (POSIX-safe; S1 not regressed).
- `artifact@v6`/`v8` still pinned (S2 not regressed).

## Notes on visibility
- Tool activity (file edits, YAML validation) is NOT in the chat search index; verified via `grep` on the workflow file directly.
- No repo state was mutated by this observer pass.
