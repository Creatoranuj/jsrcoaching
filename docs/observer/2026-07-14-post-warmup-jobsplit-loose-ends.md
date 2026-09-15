# Observer Report — 2026-07-14 — post warm-up + job-split loose ends

**Window observed:** last session (P0 → P2 → smoke hardening → Step 3 warm-up + Step 4 `secondary-flows` job split).
**Scope:** `.github/workflows/signed-apk-smoke.yml`, `maestro/smoke.yaml`, `promote-to-play`, `secondary-flows`.

## Incomplete
- [ ] **API 28 native crash** — *turn: Step 3+4 ship* — evidence: `experimental: true` set on API 28 matrix leg; crash root cause untouched — next action: pull `signed-smoke-logcat-api28` from next red run, grep `FATAL EXCEPTION` / `signal 11` / `libhwui`.
- [ ] **API 35 selector regex + warm-up + retry combo** — *turn: Step 3+4 ship* — evidence: "~95-97% probability" is a model, not a measurement. Needs one real tag push to confirm.
- [ ] **P2 `promote-to-play`** end-to-end run — *earlier turns* — evidence: soft-skip active; dry-run path shipped but never triggered.

## Follow-ups deferred (user-acknowledged)
- [ ] `PLAY_SERVICE_ACCOUNT_JSON` — blocker: user obtaining Play Console account ($25). Soft-skip guard already in place.
- [ ] Share signed APK across `smoke-signed-apk` and `secondary-flows` via artifact — deferred as "cross-job complexity"; costs ~4 min extra gradle per run.

## Linked to current work
- Warm-up block (`smoke.sh` monkey launch + `*_animation_scale 0` x3) ↔ earlier S9 selector-regex fix in `maestro/smoke.yaml` — both target the same first-paint race. If warm-up proves reliable, the `.*(email|Email).*` regex fallback becomes reducible.
- `secondary-flows` job ↔ prior observer report `2026-07-14-post-smoke-hardening-loose-ends.md` item "pdf-back optional-failure ignored on all 3 legs" — now isolated in its own job with a dedicated `signed-secondary-flows-report` artifact. Still non-blocking, but no longer invisible.

## Dropped
- **`packageName: com.safarenglishka.app` hardcoded in workflow** — flagged in `2026-07-14-p2-play-promote-loose-ends.md` AND `2026-07-14-post-smoke-hardening-loose-ends.md`. Still hardcoded. 2-minute fix, deferred a third time.
- **Per-API cold-boot threshold map** — senior-architect audit item #3 from earlier turn; 120s uniform gate still active; API 28 first-run false-red risk unmitigated.
- **ProGuard `mapping.txt`** upload — path wired in `promote-to-play`, never exercised; obfuscated crashes remain the default.

## Risks / ignored findings
- **`secondary-flows` runs with `if: always()`** — accepted for triage signal; burns ~6 min runner time even when primary matrix is red. Revisit after primary stabilises.
- **Retry loop masks flake vs real bug** — attempt-1 fail + attempt-2 pass emits only a warning; no counter/metric to catch "always-flaky" degradation over time.
- **`experimental: true` on API 28** — no expiry, no tracking issue. Risk of becoming permanent tech debt.

## Signal-only (nothing to do)
- 3-job DAG (`smoke-signed-apk` → `secondary-flows` + `promote-to-play`) validates and matches `capacitor-ci-cd` skill guidance.
- Per-API artifact naming (`signed-smoke-logcat-api${matrix}`) — clean, no v6 collisions.
- Warm-up +15s cost per leg offset by -90s from removing secondary flows from primary path.

## Notes on visibility
- Tool activity (workflow edits, YAML validation, gradle builds) is NOT in the chat search index. All claims above cross-checked against on-disk `.github/workflows/signed-apk-smoke.yml`, `maestro/smoke.yaml`, and the two prior observer reports dated 2026-07-14.
