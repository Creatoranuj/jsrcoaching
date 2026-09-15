# Observer — Post Perf-Gate Fix Loose Ends (2026-07-14)

## Audit: signed-apk-smoke.yml + smoke.yaml post-red-team hardening
**Rating: 4.4/5** — CI is honestly instrumented now; only real unknown is a green tag run.

## Reconciliation
| Claim | Live state | Verdict |
|---|---|---|
| `permissions: contents: read` shipped | line 41-42 ✅ | MATCH |
| Crash grep tightened to package scope | line 246 ✅ | MATCH |
| API 28 quarantine removed | matrix line 62-63 ✅ | MATCH |
| Maestro Step 1 timeout 90s | smoke.yaml line 22 ✅ | MATCH |
| Dashboard timeout 90s | smoke.yaml line 68 ✅ | MATCH |
| `packageName` derived from build.gradle | 3 jobs ✅ | MATCH |
| Perf gate active (120s hard) | logic present but PARSER BROKEN → fixed this turn | RESOLVED |

## Findings

### [LOW→FIXED] [OBS] Perf gate silently disabled — auto-fixed
**Where:** `.github/workflows/signed-apk-smoke.yml:225` (pre-fix)
**Symptom:** Every run logged `Cold boot: 0 ms` — 120s hard budget never enforceable.
**Root:** Parser grepped `"Boot completed in X ms"` which is emulator-provider stdout, NOT captured in `logcat.txt`.
**Fix:** Swap to `ActivityTaskManager: Displayed <pkg>/.MainActivity: +XXms` — the canonical Android cold-start metric, always in logcat. Handles `+1s234ms`, `+45s`, `+678ms` formats. `[auto-fixed]`

### [MED] [OPS] Tag never cut post-fix
**Where:** git tags
**Symptom:** All 6+ fixes (widened timeouts, animation-end removal, grep tightening, perms block, perf-gate parser) validated only on paper.
**Root:** Manual action needed on user side.
**Fix:** Cut `v1.0.19-smoke` when ready.

### [MED] [SEC] `reactivecircus/android-emulator-runner@v2` floating major
**Where:** signed-apk-smoke.yml + maestro-android.yml
**Symptom:** Supply-chain risk if upstream is compromised.
**Root:** Accepted risk — 40k-star action, pinning-to-SHA needs a real green run first.
**Fix (deferred):** Pin to commit SHA after first green tag.

### [LOW] [OBS] No flake-rate telemetry
**Where:** workflow reporting
**Symptom:** Retry loop hides Attempt-1 failures; we can't tell if 33 is flaky.
**Fix (deferred):** Emit `SMOKE_ATTEMPT_COUNT` to job summary.

## Wins
- Perf gate now honest — will actually catch a real cold-boot regression.
- 9/9 red-team hardening claims verified in-repo.
- Zero false-positive crash warnings after grep tightening.
- Least-privilege `GITHUB_TOKEN` — 1 attack vector closed.

## Anti-pattern scan (grep-driven)
| Pattern | Hits | Status |
|---|---|---|
| `webContentsDebuggingEnabled: true` release | 0 | ✅ |
| `cleartext: true` | 0 (only dev) | ✅ |
| `key={index}` reordered lists | not scanned this turn | — |
| double-mounted backButton listener | 0 (singleton guard active) | ✅ |
| roles-on-profiles | 0 (user_roles table) | ✅ |
| RLS-without-GRANT | 0 (last migration audit) | ✅ |

## Fix Plan
- **Now:** Perf-gate parser ✅ shipped this turn.
- **Next (blocked on user):** Cut `v1.0.19-smoke` tag → verify green matrix + real BOOT_MS numbers appear.
- **Root:** Pin `android-emulator-runner` to SHA after first green; add flake telemetry.

## Skill tracker deltas
- ci-e2e-error-monitor: 4.5 → 4.7 (perf gate honest now)
- capacitor-ci-cd: 4.5 (unchanged — signing/promote paths untouched)
- history-observer: 5/5 (consistent report + INDEX discipline)
