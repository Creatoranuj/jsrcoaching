# Observer Report — 2026-07-15 — post "do A" (API 28 re-added as advisory)

**Window observed:** turns #29 – #41 (Books-page fix → auto-clicker crash → Supabase connect → signed-smoke triage → `do A`)
**Scope:** signed-apk-smoke matrix, personalLibrary crash fix, Books design tokens, Supabase connect.

## Incomplete
- [ ] **Single-flight guard for `savedDownloads` / `useDownloads` mutations** — *turn #32* — evidence: *"Next (offline-first, LOW): apply same guard to `useDownloads` mutations and `savedDownloads` toggle."* — repo grep confirms: `rg singleFlight src/services/savedDownloads.ts src/hooks/useDownloads*` → **0 hits**. Same auto-clicker race pattern still lives on the downloads toggle; blast radius smaller than personalLibrary but non-zero. Next action: port `singleFlight(key, fn)` helper into `savedDownloads.ts` around toggle/remove entry-points.

## Follow-ups deferred
- [ ] **Push next tag to exercise the re-added API 28 advisory leg on a real run** — *turn #40* — blocker: manual tag push. Matrix confirmed `[28, 33, 35]` with `continue-on-error: ${{ matrix.api-level == 35 || matrix.api-level == 28 }}` at `.github/workflows/signed-apk-smoke.yml:60,68`.
- [ ] **RLS policy review on freshly connected Supabase project** — *turn #34* — blocker: user approval per table. Evidence: *"Before you deploy your app to production or use any real data, you will need to review and set up the appropriate RLS policies."* 80+ tables surfaced (users, books, payments, doubts, courses, …); no policy audit ran this session.
- [ ] **SHA-pin `reactivecircus/android-emulator-runner` + `oven-sh/setup-bun`** — *turn #38 Root* — blocker: wait for next fully-green tag before locking the SHA. *"SHA-pin `android-emulator-runner` + `setup-bun` after next green tag."*

## Linked to current work
- **Books-page `text-black` token migration** ↔ *turn #30 Root* — `text-brand-accent-foreground` token now exists (`src/index.css:72`, `tailwind.config.ts:47`); other surfaces still using raw `text-black` / `text-white` on brand-accent backgrounds should adopt the same token. Grep across `src/` needed as a follow-up sweep; not blocking, but the token is the standard now.
- **`personalLibrary` single-flight** ↔ **crashShield 15/10s reload threshold** — the two now co-operate; if a future service layer skips single-flight and pumps unhandled rejections, crashShield will still emergency-reload. Treat single-flight as the canonical mitigation pattern for user-clickable mutations.

## Dropped
- **10 of 12 skill tags from turn #35 acknowledged only in summary, not individually applied**: `asset-optimization`, `capacitor-back-button`, `capacitor-video-player-master`, `console-error-triage`, `mobile-view-expert`, `soft-touch`, `supabase-architect-auditor`, `red-team-security-audit`, `perf-exam-ready`, `sentry-triage`. Session shipped only `senior-architect-audit` + `ci-e2e-error-monitor` + `app-crash-shield`. Not necessarily wrong — most had "Fix Plan: Now: nothing" from prior turns — but the user tagged them, so worth naming.

## Risks / ignored findings
- **API 28 remains structurally advisory** — *turn #36/#38* — accepted because: *"Chromium 66 cold-parse >100s on shared GHA CPU (no HW-accel). … Re-add only if moved to a self-hosted KVM+GPU runner."* Hard-gating requires infra spend the user has not approved. Risk: silent regressions on Android 9 devices land without CI catching them.
- **API 35 remains advisory** — *turn #36* — accepted because Maestro 1.39.0 gRPC-driver drop on Android 15 Doze is an upstream bug; every known driver mitigation is already applied. Risk: Android 15 regressions land silently until Maestro upstream ships a fix (option B — Maestro 1.40.x bump — never taken).
- **Reorder-button UX debounce not applied** — *turn #32 Root* — accepted because: *"tap → tap → tap up-arrow visually moves 3 rows instead of coalescing to 1. Requires UX call."* Current behavior: 3 rapid taps on ↑ = 1 move (single-flight coalesces). Product decision pending; flagged so a user report of "reorder button broken" is not mis-diagnosed as a regression.

## Signal-only (nothing to do)
- Books-page audit (turn #30) shipped 5/5 fixes; `--brand-accent-foreground: 0 0% 8%` present at `src/index.css:72`, buy button uses it at `BookCard.tsx:77`, `foreground` variant registered at `tailwind.config.ts:47`.
- `personalLibrary` single-flight verified for all 8 mutation entry-points at `src/services/personalLibrary.ts:309,368,385,395,499,518,537,547,584`.
- Supabase project `Creatoranuj's Project` connected; `supabase/config.toml` + `src/integrations/supabase/client.ts` present. `@supabase/supabase-js` added.
- Anti-pattern quick sweep on session-touched surfaces clean: no `key={index}`, no `webContentsDebuggingEnabled: true` literal, no `cleartext: true` literal in `capacitor.config.ts` (only env-gated `CAP_DEBUG === '1'`).

## Notes on visibility
- Tool activity (edits, YAML validation, `bun add`) is NOT in the chat search index — cross-checked directly against the repo with `rg` for every claim above.
- Turns #1–#28 were not read this pass; older loose ends are covered by the 2026-07-14 observer files. This report only covers post-do-A window.
