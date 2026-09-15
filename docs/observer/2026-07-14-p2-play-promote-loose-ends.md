# Observer Report — 2026-07-14 — P0/P1/P2 Signed Smoke → Play promote

**Window observed:** current session (P0 verify → P1 matrix+perf gate → P2 auto-promote)
**Scope:** `.github/workflows/signed-apk-smoke.yml`, `docs/observer/2026-07-14-signed-smoke-learnings.md`

## Incomplete
- [ ] **P2 has never run end-to-end.** — *this turn* — evidence: `promote-to-play` gated on `push` + `refs/tags/v*`; no such tag pushed since the job was added. Next action: cut a throwaway pre-release tag (e.g. `v0.0.0-p2-dryrun`) with `PLAY_SERVICE_ACCOUNT_JSON` absent, confirm the soft-skip fires and matrix still green.
- [ ] **`PLAY_SERVICE_ACCOUNT_JSON` not yet configured.** — *this turn* — evidence: user's own message: "One-time setup you need to do: Add repo secret `PLAY_SERVICE_ACCOUNT_JSON`". Until then P2 is a permanent no-op — the "ship" is only latent.
- [ ] **P1 hard perf gate (>120s cold-boot → `exit 1`) unverified on live runners.** — *P1 turn* — evidence: threshold shipped in workflow but only Run #20 (single API 33 leg, pre-matrix) has real timing data. API 28 and 35 boot times are unknown; 120s may be too tight for API 28 on a cold ubuntu-latest runner. Next action: first matrix run — read all three `signed-smoke-logcat-api*` artifacts before trusting the gate.

## Follow-ups deferred
- [ ] **`whatsnew` locale coverage.** — *P2 turn* — only `distribution/whatsnew/whatsnew-en-US` exists. Play accepts it but Hindi/`hi-IN` (primary user base per earlier sessions) is missing. Blocker: content decision, not code.
- [ ] **`packageName: com.safarenglishka.app` hardcoded** in `promote-to-play` step — matches current `applicationId` but drifts silently if the app is ever renamed. Follow-up: read from `android/app/build.gradle` or a workflow env.

## Linked to current work
- P2 draft-status kill-switch ↔ 2026-07-13-post-CI-rename observer's "tag guard untested" item — same class of risk (tag-triggered job that has never fired on a real tag). Both resolve together on the first `v*` push after secret is set.
- P1 matrix (API 28/33/35) ↔ 2026-07-14-signed-smoke-learnings §#6 (ABI filter widening) — the `x86_64` widen still applies to all three legs; confirmed NOT reused in P2's AAB build (correct per user's own note).

## Dropped
- **`/skill:sentry-triage` and `/skill:red-team-security-audit` from the previous user turn** — acknowledged in the reply ("no code paths changed — no new attack surface") but no actual Sentry query or red-team vector list was produced. If the user wanted artifacts from those skills, they were skipped.

## Risks / ignored findings
- **`r0adkll/upload-google-play@v1`** is pinned to a floating major, not a SHA — supply-chain risk for a step that holds the Play service-account JWT. Accepted implicitly this turn; flag for a future hardening pass (pin to commit SHA like the other third-party actions should also be audited).
- **Keystore file left in workspace between "Decode" and "Cleanup"** in the promote job — cleanup step not visible in lines 255–360; verify an `if: always()` cleanup exists for `android/app/release.keystore` in the promote job too, not only in the smoke matrix job.

## Signal-only (nothing to do)
- YAML validates (2 jobs → now 2 jobs + matrix; user reported "2 jobs" which likely means job *definitions*, not leg count — semantic, not a bug).
- `minifyEnabled true` + `shrinkResources true` confirmed in release build → `mapping.txt` will exist for the upload step.
- `distribution/whatsnew/whatsnew-en-US` directory present → upload step won't 404.

## Notes on visibility
- Tool activity (workflow edits, file writes) is NOT in the chat search index. This report cross-checked the repo directly: `.github/workflows/signed-apk-smoke.yml` L255–360, `android/app/build.gradle` L57–76, `distribution/whatsnew/` listing.
- No prior turns from earlier sessions were pulled — scope was intentionally limited to today's P0→P2 arc.
