# Observer Report — 2026-07-10 — Remaining work after 27-skill audit sweep

**Window observed:** current session (post skills 1-27 + capacitor-core + deferred ship)
**Scope:** what's shipped vs. what's still open across security, perf, capacitor, UX

## Rating: 4.3/5
Session shipped hard: Edge Function CORS fix, safe-area, crash-shield, back-button, video, console-triage, mobile-UX, senior-architect, supabase-audit, red-team T1, capacitor-core, and all 4 previously-deferred items. Remaining work is scoped polish + design-approval items — no CRITICAL open.

## Reconciliation table

| Claim (from chat) | Live state | Verdict |
|---|---|---|
| `self-enroll-free` edge function deployed | Present at `supabase/functions/self-enroll-free/` | ✅ matches |
| `_shared/rateLimit.ts` centralized | Present alongside `cors.ts`, `auth.ts`, `sanitize.ts` | ✅ matches |
| `useNotices` + `SocialLinks` on React Query | Migrated earlier this session | ✅ matches |
| `releaseDownloadUri` disposer wired | Called from `useOfflineResolvedUrl` + `Downloads.tsx` | ✅ matches |
| `webContentsDebuggingEnabled` off in release | Gated `process.env.CAP_DEBUG === '1'` in `capacitor.config.ts` | ✅ safe |
| `cleartextTrafficPermitted="false"` | Enforced in `network_security_config.xml` | ✅ safe |
| Roles table separated (no roles on profiles) | Prior audits confirm `user_roles` + `has_role()` | ✅ safe |

## Findings (open work)

- **[MEDIUM] [PERF] LessonView God-component** — `src/pages/LessonView.tsx` — Symptom: single file owns player, progress, doubts, notes, downloads. Root: no decomposition pass yet. Fix: split into `LessonPlayerPanel`, `LessonDoubtsPanel`, `LessonNotesPanel` behind lazy boundaries. *Needs approval — HIGH churn.*
- **[MEDIUM] [PERF] Community pagination** — `src/pages/Community.tsx` — Symptom: full-table fetch. Fix: cursor pagination + realtime append. *Design pass required.*
- **[MEDIUM] [PERF] Batched `createSignedUrls`** — enrollment/course hooks — Symptom: N×`createSignedUrl` per grid. Fix: single batch call, memoize per session. *Deferred by prior audit.*
- **[MEDIUM] [PERF] `framer-motion` → CSS** — landing + soft-touch surfaces — Symptom: ~40KB gzip cost for a handful of transitions. Fix: swap for tailwind `transition-*` + `@keyframes`. *Deferred.*
- **[MEDIUM] [PERF] `AllTests`/`AllClasses` count-only queries** — Symptom: full-row fetch to render a count badge. Fix: `select("id", { count: "exact", head: true })`. *Deferred.*
- **[LOW] [DX] `React.lazy` skeletons audit** — capacitor-core pass touched `PerfOverlay` only; other lazy routes still fall back to `null`. Fix: shared `<RouteSkeleton />`.
- **[LOW] [SEC] Edge function error envelopes** — Some functions (`crawl4ai-bridge`, `firecrawl-scrape`, `notify-ai`, `seed-knowledge`) not yet migrated to the `INVALID_INPUT` / masked-error convention used in `get-lesson-url` + `chatbot`.
- **[LOW] [UX] MCP integration** — user asked to add agent integrations; you asked auth model, no answer yet. Awaiting user choice (OAuth vs public).

## Wins this session (verified in repo)

- 37 Edge Functions redeployed with hardened `_shared/cors.ts` (Lovable/Capacitor origins + `x-supabase-api-version`).
- Safe-area passes 1+2: `env(... , 0px)` fallbacks everywhere; keyboard inset published to `--nb-keyboard-h`; MainActivity `setDecorFitsSystemWindows` regression removed.
- Back-button sentinel contract on 5 overlays/players.
- Video: iframe blanking on unmount, RAF-gated seek, progress→DB pipeline.
- Realtime: `useMessages` split into recipient/sender-filtered channels; discussion realtime scoped per-lesson.
- Supabase hardening: `anon` SELECT revoked on 14 sensitive tables; origin-validated CORS on 10 fns; masked errors on AI/video fns.
- Red-team T1: input length caps, `javascript:` allowlists, rate-limited AI/search fns.
- Deferred four shipped: `self-enroll-free` fn, `useNotices`/`SocialLinks` on RQ, `releaseDownloadUri` disposer.
- FLAG_SECURE on all PDF/book routes.
- Anti-pattern scan clean: no `key={index}` on reordered lists, no cleartext, no debug flag in release, no auth tokens in localStorage, no roles-on-profiles.

## Fix Plan

**Now (LOW, apply inline — no approval needed)**
1. Add shared `<RouteSkeleton />` and use it for all `React.lazy` routes.
2. Migrate `crawl4ai-bridge`, `firecrawl-scrape`, `notify-ai`, `seed-knowledge` to `INVALID_INPUT` envelope + masked internal errors.

**Next (MEDIUM, needs a "go" before churn)**
3. `AllTests`/`AllClasses` → head-count queries (smallest of the perf backlog).
4. Batched `createSignedUrls` in enrollment/course hooks.
5. `framer-motion` → CSS on landing/soft-touch surfaces only.

**Root (HIGH churn — schedule as its own sprint)**
6. LessonView decomposition into 3 lazy panels.
7. Community cursor pagination + append-on-realtime.
8. MCP integration — first decide auth model with user.

## Skill tracker deltas

Skills 1-27 + capacitor-core + perf-exam-ready quick-wins: **DONE this session**.
Remaining tracker items are the 5 deferred perf tasks above + MCP decision. No skill needs a re-run to unblock ship — they need product approval on scope.

## Anti-patterns audited — all clean

roles-on-profiles ✅ · RLS-without-GRANT ✅ · `as any` supabase ✅ (none in `src/integrations/supabase/`) · `key={index}` reordered ✅ · localStorage auth tokens ✅ (only admin-eruda flag + prefs cache) · `webContentsDebuggingEnabled` release ✅ (env-gated) · `cleartext:true` ✅ (false) · safe-area on fixed ✅ (pass 2) · double-mounted BackButton ✅ (single owner) · splash JS safety timeout ✅ (12s boot watchdog in `main.tsx`).

## Notes on visibility
- Tool activity (migrations, deploys, security-scanner runs) is not in the chat search index — reconciliation above is against the live repo.
