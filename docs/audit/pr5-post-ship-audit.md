# Senior Architect Audit — Post-PR-5 Ship

**Date:** 2026-07-16
**Scope:** Whole-project state after PR 5 close (Tier A + partial B + C + D shipped, security findings resolved).
**Rating: 4 / 5** — no CRITICAL findings, one HIGH (documented Dashboard toggle), the rest MEDIUM/LOW backlog. Ready for release; no blockers.

---

## Findings

### [HIGH] [SEC] Leaked Password Protection still disabled

**Where:** Supabase Auth → Providers → Email → Password HIBP Check.
**Evidence:** `supabase--linter` WARN 11: "Leaked Password Protection Disabled". Owner-action documented at `docs/SECURITY-FIX-2026-07-06-definer-grants.md §2`; ignored in scanner memory pending Dashboard toggle.
**Why it matters:** New signups can register with passwords known to be in HIBP breach corpora. Any breached-password reuse becomes an instant account-takeover vector — HIBP check adds ~50ms to signup and blocks the top ~600M compromised passwords.
**Fix (owner-only, no code):** Toggle on in Supabase Dashboard. Not a migration. Scanner will clear on next run.

### [RESOLVED] [AUTHZ] `phone_otps` intent-lock migration

**Update 2026-07-16:** Fixed. Applied migration:
- `COMMENT ON TABLE public.phone_otps` documenting server-only intent.
- `REVOKE ALL ON public.phone_otps FROM anon, authenticated`.
- `GRANT ALL ON public.phone_otps TO service_role`.

Edge functions (`send-phone-otp`, `verify-phone-otp`) unaffected — they use
`service_role`. The 0008 INFO warn on this table is now expected and
documented in `README.md` → "Security scanner expectations".


### [RESOLVED — stale finding] [PERF] `html2pdf` chunk is 256KB gz

**Update 2026-07-16:** Verified stale. `html2pdf.js` is already
dynamic-imported at `src/components/video/NotionPageRenderer.tsx:83`
(`const mod = await import("html2pdf.js")`). The 256KB gz chunk exists
as a *separate on-demand* chunk *because* it is lazy — it is not in the
eager entry graph. No user pays for it until they tap "Download as PDF".
No code change required.



### [MEDIUM] [OBS] `SUPA_authenticated_security_definer_function_executable` will resurface on every scan

**Where:** Linter check 0029 fires once per DEFINER function callable by `authenticated` — currently 9 functions.
**Evidence:** Every `security--run_security_scan` returns 9 identical warns (see this turn's output). Ignored in scanner memory with per-function justification.
**Why it matters:** Not a real vulnerability (each function scopes to `auth.uid()` internally), but the noise buries new real findings. Scanner memory is honoured for *persisted* results only — `run_security_scan` returns fresh unpersisted results and always shows the 9.
**Fix (no SQL):** Nothing to do at DB layer. Document expectation in `README.md` audit section: "Expect 9 warns on 0029; see security-memory."
Alternative: split the "internal helper" DEFINER fns (`has_role`, `get_user_role`) into a non-exposed `internal` schema so PostgREST never sees them. High effort, medium reward — backlog.

### [LOW] [MAINT] `LessonView.tsx` still 2841 LOC single component

**Where:** `src/pages/LessonView.tsx`.
**Evidence:** `wc -l` = 2841. PR 5 partial-B extracted `CollapsiblePdfSection` + lazy-loaded 4 notion-heavy components but the main component was not split.
**Why it matters:** Onboarding new devs to this file is slow; git blame is noisy on any tab change; TS incremental compile touches it often.
**Fix:** Deferred by explicit user decision. Revisit when either (a) a new lesson tab is scoped, or (b) a bug requires touching >3 sections at once.

### [LOW] [CONFIG] `whatsnew/whatsnew-en-US` present but no locale variants

**Where:** `distribution/whatsnew/`.
**Evidence:** Directory listing shows only `whatsnew-en-US`.
**Why it matters:** Play Store release notes render only in English for a Hindi/regional-language app. Non-blocking; missed engagement opportunity in-store.
**Fix:** Add `whatsnew-hi-IN` for next release cycle. 5-line file per locale.

### [RESOLVED] [RELY] Edge Function caller map runs on cron but has no alert path

**Update 2026-07-16:** Fixed. Added
`node scripts/audit-edge-function-callers.mjs` as a step in
`.github/workflows/dependency-audit.yml`. New orphaned edge functions
now fail the weekly job (and any PR that touches `package.json` /
lockfiles).


---

## Lens summary

| # | Lens | State |
| --- | --- | --- |
| 1 | SEC | 1 HIGH (Dashboard toggle), 0 CRITICAL. Persisted scanner: 0 findings. |
| 2 | AUTHZ | 1 MEDIUM (`phone_otps` policy gap-by-design). RLS covers 84/85 public tables intentionally. |
| 3 | DATA | Largest table 256KB / 94 rows (`chatbot_logs`). No hot paths, no N+1. **Green.** |
| 4 | PERF (web) | Entry 102.9KB (budget 180). 1 MEDIUM (`html2pdf` eager). Sentry already lazy. |
| 5 | PERF (mobile/APK) | `capacitor.config.ts` clean: `allowMixedContent: false`, `webContentsDebuggingEnabled` env-gated, `allowNavigation` narrowed from wildcards, `server.url` empty. **Green.** |
| 6 | RELY | 1 LOW (audit-callers cron not wired). Edge fn error rates: not sampled this turn — read-only scope. |
| 7 | UX | N/A — no code-level UX regressions surfaced this cycle. Landing polish shipped PR 5. |
| 8 | A11Y | BottomNav aria-labels + touch targets shipped PR 5. Lesson-flow spot check deferred to next audit. |
| 9 | OBS | 1 MEDIUM (0029 scanner noise). Sentry triage docs current (2026-07-16). |
| 10 | MAINT + CONFIG | 1 LOW (`LessonView` LOC), 1 LOW (`whatsnew` locales). Config drift: none. |

---

## Wins

- Persisted security findings: **0**.
- BottomNav unified iconography + aria-labels + `text-nav` design token.
- Landing polish (mobile hero aspect, press feedback) shipped without regression.
- `min-h-dvh` migration (56 replacements) — no more dead viewport space on Android Chrome.
- LessonView notion vendor chunk (29.4KB gz) deferred to Notes-tab open.
- Two RLS policies re-scoped from raw `public` role to `authenticated` / `anon,authenticated`.
- Capacitor config drift: **zero**. `allowNavigation` narrowed from wildcards to explicit hosts.
- Roles correctly isolated in `user_roles` — `has_role` used consistently across policies.
- Every SECURITY DEFINER function sets `search_path = public` and authorizes the caller.

---

## Fix Plan

**Now (owner-only, no code):**
1. Toggle Password HIBP Check in Supabase Dashboard. **[HIGH SEC]**

**This week (~2 hrs total):**
2. Add `COMMENT ON TABLE public.phone_otps` + explicit REVOKE/GRANT migration. **[MEDIUM AUTHZ]**
3. Dynamic-import `html2pdf` at its call site. **[MEDIUM PERF]**
4. Wire `audit-edge-function-callers.mjs` into weekly CI. **[LOW RELY]**

**Backlog (do when driver appears):**
5. Move `has_role` / `get_user_role` to `internal` schema to silence 0029 scanner noise. **[MEDIUM OBS — high effort]**
6. Full `LessonView` 6-file split — revisit when a new tab is scoped. **[LOW MAINT]**
7. Add `whatsnew-hi-IN` before next Play Store release. **[LOW CONFIG]**

---

## Open questions

1. HIBP toggle — kya aap khud Supabase Dashboard me flip kar loge, ya mujhe ek reminder doc likhna hai `docs/RELEASE-QA-CHECKLIST.md` me?
2. `html2pdf` dynamic-import — pehle karun (fastest user-visible win, ~1 hr), ya batch me week ke saath?
3. Fix plan me se next turn kaunsa item pick karun? (Meri sifarish: 2 + 3 + 4 ek turn me — teeno chhote, kissi ke beech dependency nahi.)

---

Used the senior-architect-audit skill.
