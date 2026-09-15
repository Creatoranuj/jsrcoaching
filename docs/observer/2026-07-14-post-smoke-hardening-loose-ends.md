# Observer Report — 2026-07-14 — Post smoke-hardening (API 28/33/35)

**Window observed:** last session (P0 → P1 → P2 → per-API smoke fixes)
**Scope:** `.github/workflows/signed-apk-smoke.yml`, `maestro/smoke.yaml`, Play promote job

## Incomplete
- [ ] **API 28 native crash root cause** — quarantined via `experimental: true` + `continue-on-error` (workflow L52-58), but the actual crash is not fixed. Evidence: "API 28 fails soft with `logcat-crashes.txt` naming the crashing native call. That artifact drives the actual crash fix." Next: pull `signed-smoke-logcat-api28` artifact from next run, grep for `FATAL EXCEPTION` / `SIGSEGV` / plugin name, patch plugin or bump `minSdk`.
- [ ] **API 35 selector fix unverified on real device** — regex + text fallback shipped (`maestro/smoke.yaml` L36-47) but never observed passing. Estimate self-quoted at ~70%. Next: after re-run, download `signed-apk-smoke-report-api35` and confirm login step transitions.
- [ ] **`waitForAnimationToEnd` fallback not added** — flagged as the plan-B if regex fails on API 35, not implemented. Only matters if next run stays red on 35.

## Follow-ups deferred
- [ ] **`PLAY_SERVICE_ACCOUNT_JSON` secret** — user-side, explicitly deferred ("jb Mere paas Hoga Tb Apply kar Dunga"). Soft-skip guard in place; no code action needed.
- [ ] **`workflow_dispatch` dry-run of promote job** — added last turn, never actually triggered. Cannot exercise Play upload path until secret exists anyway.
- [ ] **`packageName: com.safarenglishka.app` hardcoded in workflow** — flagged as small hardening item ("workflow mein hardcoded hai — ise `build.gradle` se derive karo"), user did not pick it up. Still open.

## Linked to current work
- Today's `experimental: true` quarantine ↔ [2026-07-14 P2 loose ends](2026-07-14-p2-play-promote-loose-ends.md) item "API 28/35 boot times unverified" — boot times now verified (28→64s, 35→38s, both under 120s gate), so that specific loose end closes. Crash on 28 is a **different** failure mode than boot-time.
- Per-API artifact naming (`signed-smoke-logcat-api${matrix}`) ↔ P1 shipment note "Updated artifact naming to include `-api${{ matrix.api-level }}` to prevent collisions in GHA v6" — already correct, confirmed at L235/251/263.

## Dropped
- **Per-API cold-boot threshold map** (senior-audit item #3, REL-L) — not shipped; uniform 120s still in effect. Acceptable because both APIs cleared it, but the "warn-only for first 2 runs" idea is dropped without a record.
- **API 35 screenshot pre-verification** — user's own recommendation ("Biggest lever to push 35 → 90%+ is grabbing the API 35 screenshot"). Not done proactively; waiting on next artifact.

## Risks / ignored findings
- **`continue-on-error` on API 28** — if 28 starts silently crashing in a way that masks a shared regression (e.g. a Capacitor plugin bug that would also bite 33/35 next OS bump), the soft-fail hides it. Accepted because: gating on a known-broken leg blocks every tag. Mitigation: dashboard-watch the 28 job status monthly; flip `experimental: false` the moment logcat root cause is patched.
- **Crash/ANR warnings on API 33 + 35** — screenshots showed "2 warnings — Crash/ANR signals" on the *green* runs. Not investigated. Could be benign (system_server chatter) or a slow-burn app crash right after smoke exits. Next: grep `logcat.txt` for `am_crash`/`am_anr` scoped to app package.
- **`pdf-back` flow non-blocking failure** on all 3 legs — recurring warning, marked `optional: true` in flow. Reason unknown; nobody looked. If PDF viewer is a core feature, this is a real regression hiding in `optional`.

## Signal-only (nothing to do)
- 120s perf gate held on both non-experimental legs — gate is calibrated correctly, don't loosen.
- Workflow YAML validates; matrix `include:` shape correct.
- P2 promote job untouched this session — no drift.

## Notes on visibility
- Tool-call activity (edits to `smoke.yaml`, workflow, docs) is not in the chat search index; verified directly:
  - Workflow matrix + quarantine present at `.github/workflows/signed-apk-smoke.yml:44-58`.
  - Selector regex + text fallback present at `maestro/smoke.yaml:36-47`.
- No verification that the actual next CI run has been triggered — probability estimates are pre-run.

## Top 3 to fix next
1. **Pull API 28 logcat** after next run → patch the native crash → flip `experimental: false`. Highest-value item.
2. **Investigate `pdf-back` optional-failure** on all 3 legs — smallest effort, likely reveals a real bug.
3. **Un-hardcode `packageName`** in workflow (derive from `build.gradle`) — 5-min hygiene fix, prevents future rename break.
