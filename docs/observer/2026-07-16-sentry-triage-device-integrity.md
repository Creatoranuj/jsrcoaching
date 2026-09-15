# Sentry Triage — 2026-07-16 — `device_integrity_suspicious` on emulator

Skills applied: **sentry-triage → console-error-triage → senior-architect-audit → debugging-capacitor → ci-e2e-error-monitor**.
Source: 2-line breadcrumb export (`2026-07-14T09:08:14Z`) captured on a stock Google Android 13 emulator (`sdk_gphone64_x86_64`, API 33) — Maestro CI's default AVD. PII: none.

## 1. Summary

| # | Type / Message | Count (per CI run) | Root cause (file:line) | Category | Severity | Status |
| - | -------------- | ------------------ | ---------------------- | -------- | -------- | ------ |
| 1 | `Error: device_integrity_suspicious` | 1 per emulator boot (× API 26/30/34 legs) | `src/lib/native/security.ts:29` conflated `info.isVirtual` with real root indicators, then called `reportError` | OBS | HIGH (frequency) | **Fixed** — emulator-only match now emits a `security/emulator-detected` breadcrumb; no exception, no toast |
| 2 | Toast "Device integrity check" shown on every dev/QA emulator boot | 1 per boot | Same OR condition triggered `toast.warning` | UX | MEDIUM | **Fixed** — toast only fires on real root indicator |
| 3 | `console.warn("[security] suspicious device:", info)` logs as `[object Object]` | 1 per boot | String-arg concat lost the object shape | OBS / MAINT | LOW | **Fixed** — now `console.warn("[security] suspicious device: %s", matched.join(","))` |

## 2. Breadcrumb-only warnings

None — the entire session contained a single warn + a single exception, both accounted for above.

## 3. Fix plan

### P1 — landed in this PR
- **`src/lib/native/security.ts`** — rewrote the heuristic:
  - Build a typed `Indicator[]` (`"virtual" | "test-keys" | "magisk-like"`).
  - Emulator-only (`matched === ["virtual"]`): `addBreadcrumb("security", "emulator-detected", { model, osVersion })`, return.
  - Real root indicator: `console.warn("[security] suspicious device: %s", …)` + `reportError(new Error("device_integrity_suspicious"), { surface, matched, model, osVersion, isVirtual })` + `toast.warning(…)`.
  - `matched` is passed as structured Sentry `extra` so future grouping stays useful.
- **`maestro/smoke.yaml`** — added `assertNotVisible: "Device integrity check"` after cold-launch first-paint. Regression guard so this never comes back to CI.

### P2 — same sprint
- None; the P1 change closes the entire class.

### P3 — backlog
- Consider Play Integrity attestation (`@capacitor-community/play-integrity` or equivalent). The file header already flags this; out of scope for this fix.

## 4. Wins

- Structured `extra` on `reportError` was already correct — only the trigger was wrong.
- Non-blocking design (warn + toast, never a hard block) is the right product call for a coaching app protected by signed Bunny URLs.
- The `checked` guard already prevents duplicate reports within a session — so even before this fix, we didn't double-fire per boot.

## 5. Debugging-capacitor / CI notes

- Post-fix repro check: `adb logcat -s Capacitor:V Console:V | rg 'security|integrity'` on the Maestro emulator — expect zero `[security]` lines, one `security/emulator-detected` breadcrumb inside Sentry's ring buffer.
- Real-device test on a Magisk-rooted phone should still fire the toast + report.
- `maestro-on-apk.yml` requires no changes — the new `assertNotVisible` step inherits the existing emulator matrix.

## 6. Open questions

- None outstanding — defaults from the plan were applied (suppress toast on `isVirtual`-only in every environment; fold assertion into `smoke.yaml`; Play Integrity left as backlog).

---

Used the sentry-triage, console-error-triage, senior-architect-audit, debugging-capacitor, and ci-e2e-error-monitor skills.
