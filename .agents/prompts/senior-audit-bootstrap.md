# Senior Architect Bootstrap Prompt

**Kab use karo:** naya Lovable project banaya, GitHub connect kiya (`MrAnujBabu/35` ya koi bhi repo jisme `.agents/skills/` ho). Ye prompt paste karo — Lovable khud saare skills activate karega + Senior Architect Audit chalayega.

---

## 📋 PASTE THIS INTO CHAT (copy from `--- START ---` to `--- END ---`)

--- START ---

Tum ab is project ke Senior Staff Engineer + Supabase Architect + Mobile Architect ho. Neeche diye workflow ko exact order mein chalao. Har step ke baad ek line status do, aage badho.

## Phase 1 — Skill Bootstrap (silent, no user prompts)

1. `code--list_dir .agents/skills/` — check karo kya already hai.
2. Agar khaali/incomplete hai: `git clone --depth 1 https://github.com/MrAnujBabu/35.git /tmp/nb-skills` → `cp -r /tmp/nb-skills/.agents/skills/* .agents/skills/`
3. Ye 28 skills ek-ek karke `skills--apply_draft` se activate karo (parallel calls allowed):
   webapp-to-capacitor, capacitor-best-practices, capacitor-deep-linking, capacitor-keyboard, capacitor-offline-first, capacitor-performance, capacitor-plugins, capacitor-security, capacitor-splash-screen, capacitor-testing, debugging-capacitor, ionic-design, ios-android-logs, safe-area-handling, tailwind-capacitor, capacitor-back-button, asset-optimization, senior-architect-audit, capacitor-video-player-master, app-crash-shield, console-error-triage, soft-touch, capacitor-ci-cd, capacitor-app-store, capacitor-apple-review-preflight, capacitor-push-notifications, framework-to-capacitor, razorpay-payments, github-skill-importer, supabase-architect-auditor
4. Missing skill? Cap-go upstream se pull karo: `git clone --depth 1 https://github.com/Cap-go/capgo-skills.git /tmp/capgo && cp -r /tmp/capgo/skills/<name> .agents/skills/`

## Phase 2 — Frog-Eye Codebase Scan

Parallel karo:
- `code--list_dir src/`, `code--list_dir supabase/functions/`, `code--list_dir android/app/src/main/`
- `rg -n "console.error|any as|as any|localStorage.*token|localStorage.*role|cleartext.*true|webContentsDebuggingEnabled.*true|key=\{index\}"` src/
- `rg -n "position:\s*(fixed|sticky)" src/ --type=css --type=tsx | head -50` (safe-area check)
- `rg -n "useEffect.*fetch|useEffect.*supabase" src/ | head -30` (cleanup/abort check)
- `rg -n "import.*@capacitor" src/ | rg -v "await import|try"` (static plugin imports → web-fallback missing)
- `code--view capacitor.config.ts`, `code--view .github/workflows/build-apk.yml`
- `supabase--linter` → CRITICAL/HIGH count

## Phase 3 — Senior Architect Audit (report format below)

10 category lens: SEC, AUTHZ, DATA, PERF, RELY, UX, A11Y, OBS, MAINT, CONFIG.
Anti-patterns to flag loudly:
- roles-on-profiles, RLS-without-GRANT, `as any` on supabase queries, setState-in-render, useEffect fetch without cleanup/abort, hardcoded URLs, localStorage auth tokens, unhandled promise chains, `key={index}` on reordered lists, `webContentsDebuggingEnabled: true` in release, `cleartext: true` outside dev, static plugin imports without try/catch web-fallback, safe-area missing on fixed/sticky elements, back-button listener mounted more than once, splash without JS-side safety timeout, missing `app-crash-shield` heartbeat.

## Phase 4 — Deliverable (Ship Report)

Ek single markdown file `docs/AUDIT-$(date +%Y%m%d).md` mein likho, format:

```markdown
# Audit: <scope>
**Rating: X/5** — one-line verdict.

## Reconciliation table
| Claim (from prev chat / plan) | Live state | Verdict |
|---|---|---|

## Findings
### [CRITICAL] [SEC] Title
**Where:** file:line
**Symptom:**
**Root cause:**
**Fix:**

### [HIGH] [PERF] ...
### [MEDIUM] [MAINT] ...
### [LOW] [UX] ...

## Wins
- ...

## Fix Plan
- **Now (this session):** CRITICAL/HIGH — surface for approval
- **Next (this week):** MEDIUM
- **Root (backlog):** LOW + arch-level

## Speed & Perf Delta (before → after estimate)
| Metric | Before | After (projected) | How |
|---|---|---|---|
| Cold start | | | |
| Bundle KB | | | |
| Largest route JS | | | |
| Supabase RLS warns | | | |

## Skill Tracker (28 rows)
| # | Skill | State | Note |
|---|---|---|---|
| 1 | webapp-to-capacitor | ✅ / ⚠️ / ⏳ | |
...

## Reusable Audit Prompt
(paste this entire block verbatim so user can re-run)
```

## Phase 5 — Rules (non-negotiable)

- **No edits without approval** for HIGH/CRITICAL. Surface, don't apply.
- **LOW-risk fixes may be applied inline** with a `[auto-fixed]` note: missing GRANTs, missing indexes, missing error boundary, `console.log` cleanup, missing cleanup in `useEffect`.
- **Never touch** `supabase/migrations/*` by hand — use `supabase--migration` tool.
- **Never** re-add CapacitorUpdater/Capgo unless user explicitly asks.
- **Never** ship `capacitor.config.ts` with `server.url` set — APK stays self-contained.
- **Razorpay:** server-side order + HMAC verify + webhook truth. No client-only enrollment.
- **Roles:** only in `public.user_roles`, checked via `has_role(auth.uid(), 'admin')`.
- End with: "Used senior-architect-audit + supabase-architect-auditor skills."

--- END ---

## Notes

- Prompt idempotent hai — dubara chalao to sirf missing skills add hongi, audit re-run hoga.
- Har nayi project mein first message ke roop mein paste karo. Baaki sab automatic.
- Agar tum sirf audit chahte ho (skills already active hain), Phase 1 skip karne ko keh do.
