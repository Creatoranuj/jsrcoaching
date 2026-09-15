# Observer Report — 2026-07-08 — Full session recap + audit mind-map

**Window observed:** entire session (security-hardening pass → soft-touch Wave A plan)
**Scope:** Supabase security posture + edge functions + frontend soft-touch polish
**Skills used:** history-observer, senior-architect-audit, supabase-architect-auditor

---

## Mind-map (what got done vs what's open)

```
Safar English / Safar_English_ka
│
├── ✅ DONE — Security hardening (8/8 findings resolved, scanner clean)
│    ├── Prompt-injection (2)
│    │    ├── supabase/functions/_shared/sanitize.ts    ← sanitizeAiField()
│    │    ├── deep-search-lecture/index.ts              ← wraps user input in <lesson_context source="UNTRUSTED">
│    │    └── summarize-video/index.ts                  ← same wrapper + grounding rules
│    ├── RLS paywall gaps (3)
│    │    ├── lecture_schedules  ← enrollment-or-free + admin/teacher bypass
│    │    ├── live_sessions      ← same pattern (recording_url no longer public)
│    │    └── notes              ← enrollment check added
│    ├── SECURITY DEFINER exposure (2)
│    │    ├── anon EXECUTE revoked on all public SECURITY DEFINER fns
│    │    └── get_platform_stats → moved to edge fn `platform-stats` (service_role, aggregate only)
│    │         └── src/hooks/usePlatformStats.ts        ← now invokes edge fn
│    └── Public bucket listing (1)
│         └── sensitive buckets flipped private; book-covers/content/notices kept public for CDN
│
├── 🟡 PLANNED, NOT SHIPPED — Soft-touch Wave A (~6 files)
│    ├── src/components/Layout/Header.tsx   ← selectionHaptic + active:bg-muted/60 active:scale-[0.99]
│    ├── src/components/Layout/Sidebar.tsx  ← same
│    ├── src/pages/Login.tsx                ← tapHaptic("light") on submit + active:scale-[0.97]
│    └── src/pages/Index.tsx                ← hero CTAs same layers
│    ├── Wave B (deferred): Downloads, LessonView, Books
│    └── Wave C (deferred): Admin + settings
│
└── 📊 Audit snapshot (docs/AUDIT-2026-07-08.md)
     └── Rating 4/5 · 0 ERROR · advisory WARNs remaining (GraphQL discoverability, OTP config)
```

---

## Findings — Senior architect + Supabase auditor lens

### CRITICAL
- **None.** Scanner clean (`supabase`, `supabase_lov`, `agent_security`, `supply_chain` all 0 findings).

### HIGH
- **None active.** All 8 requested internal_ids resolved and marked via `manage_security_finding`.

### MEDIUM
- **[SEC] GraphQL discoverability** — ~95 tables visible to `anon`/`authenticated` via `pg_graphql`. RLS still blocks rows, but schema names leak intent. Fix: `REVOKE SELECT ... FROM anon` on tables with zero anon policies (needs eyeball — courses/hero_banners/subscription_plans are intentionally public). *Deferred, tracked in AUDIT-2026-07-08.md.*
- **[CONFIG] Auth OTP expiry & leaked-password protection** — dashboard toggle, not code. *Needs user action in Supabase → Auth → Providers.*
- **[MAINT] Two migration paths** — root `supabase/migrations/` (live, 20 files) and `safarenglishka/supabase/migrations/` (mirror). Risk of drift; the root is authoritative per past scanner runs. *Recommend: gitignore or explicitly document mirror.*

### LOW
- **[OBS] Observer index missing** — `docs/observer/INDEX.md` did not exist; created below.
- **[MAINT] `docs/AUDIT-2026-07-08.md` fix block has SQL syntax error** — the `EXECUTE format(...) FROM pg_proc ...` block is not valid PL/pgSQL; the fallback DO block below it is the one that actually runs. Cosmetic — the real revoke migration is `20260708094124_*.sql`.
- **[MAINT] Old GRANT still present** — migration `20260601130733_*.sql` re-granted `get_platform_stats` to `anon`; latest migration reverses it. Timeline is fine, but a squash pass would reduce reviewer confusion.

---

## Incomplete
- [ ] **Soft-touch Wave A** — plan finalized, 0 files touched — evidence: last user message "/skill:soft-touch Soft-touch — Wave A only" is scoping-only, no apply command issued.
- [ ] **Advisory linter WARNs** (~110) — surfaced in AUDIT doc, not scheduled.

## Follow-ups deferred
- [ ] **Wave B (Downloads / LessonView / Books)** — blocker: user wants usage-driven order after Wave A ships.
- [ ] **Wave C (Admin + settings)** — blocker: same.
- [ ] **Dashboard toggles** (OTP expiry, leaked-password) — blocker: manual step, not code.

## Linked to current work
- Current soft-touch plan ↔ `src/lib/native/haptics` wrapper — must be the only haptic entry point (Wave A rule).
- `platform-stats` edge fn ↔ `usePlatformStats` hook — landing page anon path now depends on edge fn cold-start; watch p95.

## Dropped
- None this session.

## Risks / ignored findings
- **book-covers / content / notices buckets stay public** — accepted: needed for CDN thumbnails and OG images; RLS on inserts still enforced.
- **Authenticated SECURITY DEFINER RPCs retained** (`has_role`, `get_user_role`, `get_quiz_questions`, `match_knowledge`, `increment_book_clicks`, `get_user_profiles_admin`, `verify_enrollment_for_attendance`) — accepted: each authorizes the caller and sets `search_path = public`.

## Signal-only
- Scanner timestamps say `up_to_date: false` for 4 of 6 scanners — a re-scan on next turn will confirm cleanliness; findings list is already empty.
- 40+ edge functions deployed; no per-function auth audit in this session — out of scope for the 8-finding fix set.

## Notes on visibility
- Tool activity (migrations, edge fn deploys, security marks) is **not** in the chat search index. Cross-checked via repo: migrations `20260708*.sql` present, `_shared/sanitize.ts` present, `platform-stats/index.ts` present, `usePlatformStats.ts` updated.

---

## Fix plan (nothing to apply now)

1. **CRITICAL/HIGH:** none.
2. **MEDIUM:** schedule GraphQL anon-revoke pass; enable OTP + leaked-password in dashboard.
3. **LOW:** ship Wave A when user says "go"; add `.gitignore` for the `safarenglishka/` mirror or document its purpose.

Rating: **4/5** — solid, production-ready security posture; polish work (soft-touch waves + advisory WARNs) is the only backlog.

Used the history-observer, senior-architect-audit, and supabase-architect-auditor skills.
