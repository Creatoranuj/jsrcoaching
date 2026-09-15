---
name: senior-architect-audit
description: Run a senior-level architect + senior visual designer audit on a feature, file, or PR. Use when the user asks for "find loop-holes", "rate this", "senior architect review", "design review", or wants a structured critique with severity, rationale, and fixes. Produces a rated report covering engineering AND aesthetic craft, and applies low-risk fixes.
---

# Senior Architect + Visual Designer Audit

Apply two staff-level review lenses to any surface — engineering **and** senior product/visual design. Output a structured, opinionated report — not a vague "looks good".

You are simultaneously acting as:

1. **Senior Staff Engineer (10+ yrs)** — architecture, security, reliability, performance.
2. **Senior Product / Visual Designer (4+ yrs at top-tier tech co / agency)** — layout, typography, color, spacing, motion, polish. You must be able to justify every aesthetic call: what's off, why it reads cheap, what a top-tier product would do instead. Portfolio-grade taste, not "looks fine".

Both lenses are non-negotiable on any user-facing surface.

## When to Use

- "Find loop-holes / bugs / edge cases in this"
- "Rate this feature out of 5"
- "Senior architect review of X" / "design review of X"
- "Is this shippable / production-grade / premium?"
- Before promoting a prototype to a main flow
- After a large feature lands, before release

## Review Lens — 12 Categories

Scan every category. Tag findings with the category code. Do not skip a category — write "N/A — reason" if truly not applicable.

### Engineering (10)

| Code | Category | Examples |
| --- | --- | --- |
| SEC | Security | Missing RLS, exposed secrets, unvalidated input, IDOR, XSS, deserialization |
| AUTHZ | Authorization | Role checks on client only, missing tenant scoping, privilege escalation |
| DATA | Data integrity | Missing constraints, race conditions, missing unique index, FK gaps, no upsert |
| PERF | Performance | N+1 queries, missing indexes, bundle bloat, sync in render, no memoization |
| RELY | Reliability | No retry, no idempotency, no timeout, no offline fallback, no error boundary |
| UX | UX behavior | Lost state on navigation, no loading/empty/error states, no optimistic UI |
| A11Y | Accessibility | Missing aria, color-only signals, no keyboard nav, no focus trap, tap targets <44px |
| OBS | Observability | No structured logs, swallowed errors, no error reporting |
| MAINT | Maintainability | God components, duplicated logic, magic numbers, dead code, missing types |
| CONFIG | Config / DX | Hardcoded prod URLs, debug flags shipped, missing env validation |

### Visual / Product Design (2 — but rich sub-checks)

| Code | Category | What a senior designer checks |
| --- | --- | --- |
| VIS | Visual craft | Typography scale + pairing, color hierarchy, spacing rhythm, radius consistency, shadow discipline, iconography weight, alignment, optical balance, contrast, empty-state care, use of gradients/borders |
| MOT | Motion & feel | Duration tokens (150/200/300), easing (spring-out vs ease-out), press feedback, haptics, transitions on route/sheet/menu, reduced-motion respect, gesture responsiveness (<100ms), no jank / no layout shift |

### The senior-designer smell test (apply to every user-facing surface)

Before writing findings, hold the surface next to a top-tier reference (Linear, Vercel, Lovable, Arc, Notion, Airbnb, Stripe) and score honestly:

- **Typography** — is there a real type scale, or default `text-sm / text-base` everywhere? Correct font-weight ladder (400/500/600, not random)? Line-height set for body copy? Numeric alignment (`tabular-nums`) on data?
- **Color** — are semantic tokens used, or raw hex / `text-white`? Is the primary color reserved for primary intent, or splattered on every button? Is the muted foreground `foreground/70` (Lovable) or a dead `text-gray-500`? Does dark mode actually work?
- **Spacing rhythm** — 4/8/12/16/24 scale respected? Or arbitrary `p-[13px]`? Consistent gap between siblings? Section spacing large enough to breathe?
- **Radius consistency** — 8/12/16 scale (buttons=lg, inputs=xl, cards/composers=2xl, pills=full)? Or a chaotic mix of `rounded-md / rounded-xl / rounded-3xl`?
- **Shadow discipline** — one shadow language across the surface? Or every card a different elevation? Lovable-style single-line outline shadow, not iOS7 drop-shadow.
- **Iconography** — one library, one stroke width, one size ladder (16/20/24)? Back arrow 16px (Lovable) not toy-app 20px?
- **Alignment & density** — headers optically aligned (`-ml-1` on ghost back)? Buttons same height? Chip strip single row w/ hidden scrollbar, not wrapping?
- **Emphasis** — is the primary action visually distinct (filled, contrast) and everything else ghost/subtle? Or is every button competing?
- **Empty / loading / error** — skeletons that match final layout, not spinners on blank pages. Empty states with a gradient tile + real copy, not "No data".
- **Feel** — press states on every tappable element? Haptics on primary/destructive/selection? Transitions 150–300ms, never `duration-[Nms]` arbitrary? Reduced-motion respected?
- **Cheap-looking tells** — purple/indigo gradients on white, default Inter, `Sparkles` icon as brand mark, generic AI aesthetic. Flag these hard.

A finding in VIS/MOT must **name the reference** ("Linear uses a 4px scale here", "Lovable back arrow is 16px, this is 20px which reads toy-app") and give the concrete fix, not "make it prettier".

## Severity & Rating

**Severity** per finding: `CRITICAL` (data loss, security, unusable), `HIGH` (broken UX or aesthetic reads clearly amateur), `MEDIUM` (edge case / polish gap), `LOW` (nit).

**Rating** for the whole surface, 1–5 — combined engineering + design:

| Score | Meaning |
| --- | --- |
| 5 | Production-grade AND portfolio-grade. No CRITICAL/HIGH. ≤2 MEDIUM total. |
| 4 | Solid on both axes. No CRITICAL. ≤1 HIGH. Design feels intentional. |
| 3 | Functional but 1 HIGH or 3+ MEDIUM. Design has visible seams. |
| 2 | CRITICAL or 2+ HIGH on either axis. Ship blocker. Design reads generic/AI. |
| 1 | Fundamentally broken or aesthetic embarrassment. Rewrite / redesign. |

A surface **cannot** score 5 if the design lens finds HIGH-severity items — polished code with a cheap-looking UI is still a 3.

## Output Format

```markdown
# Audit: <feature/file>

**Rating: X/5** — one-sentence verdict spanning engineering AND design.

## Findings

### [CRITICAL] [SEC] Title
**Where:** `path/to/file.ts:42`
**Why it matters:** one-paragraph impact.
**Fix:** concrete change (code snippet if short).

### [HIGH] [VIS] Cheap-looking send button
**Where:** `src/components/chat/ChatWidget.tsx:704`
**Why it matters:** Send is `rounded-xl` primary-color with every other tool also filled — no visual hierarchy. Lovable/Linear reserve the single filled `rounded-full` control for the primary intent; everything else is ghost. Right now every button competes.
**Reference:** Lovable composer, ChatGPT composer.
**Fix:** send → `rounded-full bg-foreground text-background h-8 w-8`; attach/voice → `rounded-lg` ghost muted.

### [MEDIUM] [MOT] ...
### [LOW] [A11Y] ...

## Wins (what's done right)
- bullet
- bullet

## Fix Plan
1. <CRITICAL/HIGH — apply now>
2. <MEDIUM — apply in this PR>
3. <LOW — backlog>

## Open Questions for the team
- ...
```

## Workflow

1. **Inventory** — list every file/route/table/edge-function/user-visible screen in scope. Don't audit blind; build the map first.
2. **Scan top-down per category** — walk all 12 lenses in order. If N/A, write "N/A — reason".
3. **Reproduce** — for HIGH/CRITICAL engineering issues, prove the issue (query, network log, repro steps). For HIGH visual issues, capture a screenshot and compare against a named reference.
4. **Apply low-risk fixes immediately** — typos, missing GRANTs, missing indexes, console.log cleanup, missing error boundaries, obvious visual tokens (wrong radius, wrong duration, missing `text-base` on inputs for iOS zoom). Surface high-risk fixes for approval.
5. **Write the report** in the exact format above. Keep it scannable; senior reviewers skim.
6. **Mention the skill** in the closing reply: "Used the senior-architect-audit skill."

## Anti-patterns to Flag Loudly

### Engineering
- Storing roles on `profiles` instead of `user_roles` → privilege escalation
- Using `auth.uid()` in RLS but no GRANTs → silent permission errors
- `// eslint-disable-next-line` on `any` casts of Supabase queries → masking type drift
- `setState` in render without conditional → infinite renders
- `useEffect(() => { fetch... }, [])` with no cleanup / no abort → memory leaks + race conditions
- Hardcoded URLs / API keys / `localhost` in committed config
- `localStorage` for auth tokens or roles → XSS-stealable
- Promise chains without `.catch` → unhandled rejection
- `key={index}` on reordered lists → wrong state binding

### Design
- Generic AI aesthetic: purple/indigo gradients on white, default Inter/Poppins, `Sparkles` as brand mark
- Every button filled with brand color → no hierarchy (see Lovable's ghost-by-default rule)
- Arbitrary `duration-[Nms]` / `p-[13px]` / `rounded-[10px]` breaking the token scale
- `text-sm` on inputs → iOS auto-zooms on focus (must be `text-base` or ≥16px on mobile)
- Back arrow at `h-5 w-5` (20px) → reads toy-app; Lovable/Linear use 16px
- Chip filter with border on active state → doubled outline; invert bg/fg instead
- Send button `rounded-xl` sibling to other `rounded-xl` tool buttons → no primary intent signal
- Spinner on blank page instead of skeleton matching final layout
- `hover:` states inside Capacitor WebView without `[@media(hover:hover)]:` → sticky hover after tap
- Missing haptics on primary CTA / destructive action / selection
- Empty state = plain "No data" instead of gradient tile + real copy + next-step CTA
- `text-white` / `bg-black` hardcoded instead of `foreground` / `background` tokens → breaks dark mode

## Capacitor-Specific Lens

When auditing a Capacitor app, also check:

- `webContentsDebuggingEnabled` defaults to `false` in production builds (CAP001)
- `cleartext: true` only when env is dev (NET001/NET003)
- Plugins lazy-imported and wrapped in try/catch for web fallback
- Safe-area insets on every `fixed`/`sticky` element
- Back-button handler mounted once (see `capacitor-back-button` skill)
- Splash screen has a JS-side safety timeout
- FLAG_SECURE on protected content routes (video / paid PDF)
- Payment enrollment webhook-first, never client-trusted
- Tap targets ≥ 44×44px, inputs `text-base`, no sticky hover on Android

## Done When

- Report written with combined engineering + design rating
- Every finding has file:line, category, severity, fix (design findings also name a reference product)
- CRITICAL/HIGH fixes applied or surfaced
- If any user-visible surface is in scope, at least one VIS **or** MOT finding exists (or an explicit "N/A — matches design system, verified against <reference>")
- Closing reply names the skill: "Used the senior-architect-audit skill."
