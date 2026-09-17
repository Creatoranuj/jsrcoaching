# Observer Report — 2026-09-17 — Session loose ends (Ask-a-Doubt CORS → 12-lane audits)

**Window observed:** messages #1…#63 of this session (2026-09-17 01:4x → 04:0x UTC)
**Scope:** Ask-a-Doubt CORS blocker, brand rename, 3 audit passes (9-lane, 12-lane end-to-end, 12-lane verification), workspace/connector churn
**Repo state cross-checked:** local clone at `2419151`; final report `AUDIT_2026-09-17_FINAL.md` pushed via API as `2f0791db05` (not in this clone's log)

## Incomplete

- [ ] **Ask-a-Doubt is still down in production** — *turns #10, #16, #61* — evidence (#16): "Supabase → Edge Functions → Secrets me `ALLOWED_ORIGINS` ki value `https://jsrcoaching.vercel.app` kar dein". Live re-probe **04:05 UTC today** still returns `access-control-allow-origin: https://safarenglishka.vercel.app` for `ai-health`, `resolve-doubt`, `chatbot`. Code side is correct — `supabase/functions/_shared/cors.ts:35-45` already auto-allows the project's Vercel host. **Only the deployed bundle is stale.** Next action: redeploy the 44 functions, or set the secret.
- [ ] **9-step fix plan from `AUDIT_2026-09-17_FINAL.md`: zero steps applied** — *turn #59* — the final pass was verification-only by design. Every item below is still true in code today:
  - Bunny URLs unsigned — `src/lib/bunnyCdn.ts` contains **no** `token` reference at all (grep: 0 hits); same for `supabase/functions/bunny-cdn/index.ts:149-155`.
  - `src/App.tsx`: 71 `<Route ` entries, 8 `ErrorBoundary` occurrences (≈5 routes wrapped + root) → ~66 routes unguarded.
  - `src/components/admin/ContentDrillDown.tsx:163-174` — still a sequential `for (const ch of chapters) await supabase...` count query (N+1).
  - `src/assets/success.mp3` — still **0 bytes**.
  - Zod validation in edge functions — still **0 of 44** function dirs reference `zod`.
- [ ] **`deploy-functions.yml` never landed** — *roadmap.md* — blocker: GitHub token lacks the `workflow` write scope. Current connector scopes are `read:user`, `repo`.

## Follow-ups deferred

- [ ] **Bunny dashboard "Token Authentication" status unknown** — *turns #43, #44* — user was asked ("On / Off / Pata nahi") and the question was interrupted by a workspace-move message. Until answered, CRITICAL-1 severity is undecidable: unsigned URLs are either an active paid-content leak or a missing defence-in-depth layer.
- [ ] **Live proof of a real doubt round-trip** ("Pankaj Sir is typing…" → AI reply screenshot) — *roadmap.md* — gated behind the CORS redeploy above.
- [ ] **Leaked-password protection** still disabled (Supabase linter, 27 issues total incl. `phone_otps` RLS-enabled-no-policy) — dashboard toggle, never actioned.

## Linked to current work

- **3.5/5 → 4/5 rating change** ↔ *turns #43 (user restated 3.5) and #59 (final 4/5)* — the upgrade came from **retracting three wrong claims**, not from fixes. Anyone reading the older `AUDIT_2026-09-17_END-TO-END.md` will act on findings that no longer hold. The END-TO-END report is superseded by `AUDIT_2026-09-17_FINAL.md`.
- **Connector churn ↔ every push failure** — *turns #37, #45, #49, #57* — the workspace moved 3+ times; `GITHUB_API_KEY` vanished mid-turn at least once and the final report push failed until GitHub was re-linked. Any future long run should re-verify the connector immediately before a push, not at the start.
- **`supabase--deploy_edge_functions` is available in this workspace** ↔ the CORS blocker — this changes the blocker's owner. Caveat: this Lovable project's own `supabase/functions/` is empty (blank template), so deploying as-is would push nothing. The repo's 44 functions must be brought into the project first — that is a real code change and needs an explicit go-ahead.

## Dropped

- **3 CRITICAL fixes: approval asked, never given** — *turns #43 → #44* — the AI opened a choice ("fix all three / just mobile / just safety net / just video lock") and the user's next message was an unrelated workspace-connect request. The question was never re-asked. This is the single largest dropped thread of the session — `roadmap.md` still lists it as "user ki approval par shuru".
- **`app_config` store-URL default still `naveenbharat.vercel.app`** — *roadmap.md HIGH #2* — surfaced in an earlier pass, never migrated, never re-raised in any of the three audit passes.

## Risks / ignored findings

- **Three retracted claims — do not resurrect** — *turn #59*:
  1. Screen-recording protection **is** implemented (`src/hooks/useScreenProtection.ts`, ref-counted, bootstrapped in `main.tsx`, admin bypass).
  2. `has_role()` public/anon access **is** already revoked (migration `20260731105058`).
  3. Tabs are **not** 28px in practice — `TabsList` is `h-9` (36px) and live Playwright at 411px found **zero** targets under 44px. Real finding is narrower: dense tab rows in admin/quiz screens.
- **Audit fatigue is now a measurable cost** — three full audit passes in ~2.5 h produced one report of record and zero shipped fixes. Accepted because the user explicitly requested each pass; flagged so the next request defaults to fixing, not re-auditing.
- **`AUDIT_*` file sprawl** — 13 `AUDIT_*.md` files at repo root, several same-day and mutually contradicting. Risk: the wrong one gets read.

## Signal-only (nothing to do)

- Brand rename is clean: no `Ramchandra` references remain; surviving `safarenglishka` strings are the deliberate ones (phone-login internal email format, separate recording-storage domain, historical docs, DB links).
- Typecheck, Vite build and 702 tests were green at the last fix commit (`4930bb4`).
- Supabase project `wegamscqtvqhxowlskfm` verified live again at 04:05 UTC today.
- `docs/observer/` history is intact — 40+ prior reports, none overwritten.

## Notes on visibility

- Chat search indexes **user + assistant text only** — tool activity (migrations, edits, deploys, security scans, subagent lane output) is invisible to it. Every code-state claim above was therefore re-verified against the clone (`grep`/`ls` with file:line) or against live endpoints (curl OPTIONS, Supabase query) in this turn, not taken from chat.
- The 12 subagent lanes ran in separate sandboxes; their raw output is gone. Only what was folded into `AUDIT_2026-09-17_FINAL.md` survives.
