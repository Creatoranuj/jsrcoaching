# Observer Report — 2026-07-14 — post red-team CI hardening + reusable audit prompt rating

**Window observed:** turns following the "real root-cause round" (Maestro
timeouts/regex widened, crash grep tightened, API 28 quarantine removed) through
the red-team pass that added `permissions: contents: read` to
`.github/workflows/signed-apk-smoke.yml`.
**Scope:** signed-smoke CI pipeline + reusable audit prompt template quality.

## Reconciliation table

| Claim (from this session) | Live state | Verdict |
|---|---|---|
| API 28 `experimental: true` quarantine removed | `.github/workflows/signed-apk-smoke.yml:44-53` — matrix now `[28, 33, 35]`, no `continue-on-error: matrix.experimental` | ✅ |
| Crash grep tightened to scoped signals only | Same file `~L235` — `beginning of crash\|FATAL EXCEPTION\|ANR in ${ANDROID_PACKAGE}\|E AndroidRuntime.*${ANDROID_PACKAGE}\|tombstone` | ✅ |
| `waitForAnimationToEnd` removed from `maestro/smoke.yaml` | Confirmed — no matches, replaced with `takeScreenshot: before-login-assertion` note | ✅ |
| Step 1 landing regex widened + 90s timeout | `maestro/smoke.yaml:14-22` — `Safar English\|Login\|Welcome\|Get Started\|Sign In\|Continue` at 90000ms | ✅ |
| Dashboard token added + 90s timeout | `maestro/smoke.yaml:60-68` — `Quick Actions\|All Classes\|No active courses\|Continue where you left\|Dashboard` at 90000ms | ✅ |
| Least-privilege `permissions:` block added | `.github/workflows/signed-apk-smoke.yml:32-38` — `contents: read` only | ✅ |
| `upload-google-play` pinned to commit SHA | Line 561 — `r0adkll/upload-google-play@935ef9c68bb393a8e6116b1575626a7f5be3a7fb` | ✅ |
| Observer doc for this round | `docs/observer/2026-07-14-signed-smoke-learnings.md` appended | ✅ |
| `packageName` derived from `build.gradle` | Prior round shipped — env `ANDROID_PACKAGE` referenced 4× in workflow | ✅ |

## Incomplete
- [ ] **API 28/33/35 not re-run on a real tag** since the widened-timeouts fix — evidence: only paper validation done this round; last real run was the all-red round whose logs were analyzed. Next action: cut `v1.0.19-smoke` tag and check the three matrix legs + secondary-flows job.
- [ ] **`/index` 19.9s main-thread freeze** (from `docs/AUDIT-20260706-mobile-apk-payments.md` HIGH) — dashboard timeout bump masks it for CI but on-device cold-start is still bad. Next action: perf marks around persister/hero render on `/index`.
- [ ] **`reactivecircus/android-emulator-runner@v2` floating major** — accepted this round as LOW; not SHA-pinned. Next action: pin after next green run.
- [ ] **`oven-sh/setup-bun@v2` floating major** — same status, same next action.

## Follow-ups deferred
- [ ] **`PLAY_SERVICE_ACCOUNT_JSON` still unset** — user confirmed they'll add when they have the Play Console account (~$25 one-time). `promote-to-play` soft-skips gracefully; no code change needed.
- [ ] **`experimental: true` expiry policy** (flagged in `2026-07-14-post-warmup-jobsplit-loose-ends.md`) — now moot, quarantine removed. Close.

## Linked to current work
- Current perms hardening ↔ `2026-07-08-sprint3-red-team.md` — that report established the 25-vector matrix; today's finding is `#17 secrets` (workflow-token overprivilege). Consistent with prior posture: RLS + GRANT + no bundle secrets held; the gap was CI-token, now closed.
- Current crash-grep tightening ↔ `2026-07-14-signed-smoke-learnings.md` "false positives closed" — same file, same fix, appended cleanly.

## Dropped
- None this session — every red-team finding was either fixed (`#17`) or explicitly accepted with reason (`#22` floating majors).

## Risks / ignored findings
- **Third-party actions still on floating tags** (`android-emulator-runner`, `setup-bun`) — accepted because pinning without a proven-green run is risky (can't tell if a green-then-red is upstream drift vs local change). Revisit after next tag.
- **Retry loop hides flake rate** — first-attempt vs second-attempt not tracked; a leg that reliably fails once and passes on retry looks identical to a stable leg. Backlog: emit `flake_attempt=N` to job summary.

## Signal-only (nothing to do)
- YAML validates via `js-yaml` `loadAll` — parser confirmed both files.
- Observer index has 20+ entries; consider a rollup once next tag closes the CI thread.

## Rating — Reusable Audit Prompt template

**Rating: 4/5** — the prompt is well-structured and produces consistent output, but has two design-lens gaps that limit it to engineering audits.

### Wins
- **Reconciliation table first** — forces claim-vs-reality up top, catches drift from prior chats before findings are even written. Best single feature of the template.
- **[SEVERITY] [CATEGORY] tags** — greppable across observer/audit history (`rg "\[HIGH\] \[SEC\]" docs/`).
- **Fix Plan tri-split (Now/Next/Root)** — matches the natural cadence of a session; Root bucket catches items that would otherwise be dropped.
- **Explicit anti-pattern list** — the 14 named traps (roles-on-profiles, RLS-without-GRANT, `key={index}`, `webContentsDebuggingEnabled:true`, safe-area on fixed, etc.) are the same ones this project keeps re-hitting; having them inline stops re-litigation.
- **"LOW may be applied inline, HIGH/CRITICAL needs approval"** — matches Lovable's `<critical-instructions>` "only change what the user asked for"; keeps scope discipline.

### Findings

**[MEDIUM] [MAINT] No design-lens categories in the prompt**
- Where: the `Reusable audit prompt` header text in the user message.
- Symptom: prompt lists engineering anti-patterns only; senior-architect-audit skill mandates VIS + MOT findings on any user-facing surface. Running this prompt on a UI change produces an engineering-only report and silently skips the design lens — matches the "cannot score 5 with HIGH design findings" rule, so scores get inflated.
- Fix: add two rows to the anti-pattern list: `purple/indigo gradients + default Inter (cheap AI aesthetic)`, `every button filled primary color (no hierarchy)`. Add a `[VIS]` and `[MOT]` category example.

**[MEDIUM] [OBS] No "regression guard" field per finding**
- Where: `Findings — [SEVERITY] [CATEGORY] Title, Where, Symptom, Root, Fix` schema.
- Symptom: red-team-security-audit skill and this project's history both mandate a named regression check (Playwright, linter rule, `rg` grep) per fix; the template's Fix field alone lets fixes ship without a guard, and next round's observer sweep has to re-verify by hand (visible in three consecutive observer reports flagging "packageName still hardcoded").
- Fix: extend row to `Title, Where, Symptom, Root, Fix, Regression guard`.

**[LOW] [MAINT] "Skill tracker deltas" section rarely populated**
- Where: template footer.
- Symptom: last 4 observer reports have empty or single-line deltas; the info lives better in one persistent `docs/SKILLS-AUDIT.md`.
- Fix: drop from template, keep the skill list in one place.

**[LOW] [MAINT] Anti-pattern list uses code fragments, not semantic names**
- Where: `useEffect fetch without cleanup`, `key={index} on reordered lists`.
- Symptom: greppable but not searchable in chat history when discussed conversationally.
- Fix: add short handle: `RENDER-01: useEffect fetch without cleanup`, `LIST-01: key={index} on reordered lists`. Enables `rg RENDER-01 docs/` audit trail.

### Fix Plan
1. **Now (LOW, inline in this observer):** — none, template lives in user's prompt library.
2. **Next (user side):** add VIS/MOT rows + Regression guard column to the template. 5-min edit.
3. **Root (this project):** cut the `v1.0.19-smoke` tag and observe the real CI outcome — that's the only unknown left.

## Notes on visibility
- Tool activity (file edits to `signed-apk-smoke.yml`, `maestro/smoke.yaml`) is NOT indexed in chat search; verified via `rg` against the repo instead. All claims in the reconciliation table have file:line evidence.
- Screenshots the user attached earlier this session (GitHub Actions failure summaries) are not in chat search; treated as one-time signal, not queryable.

Used the history-observer skill.
