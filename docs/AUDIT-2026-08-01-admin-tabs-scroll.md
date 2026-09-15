# Audit — Admin Panel: chip-row scroll/clipping, console triage, Capacitor perf

Date: 2026-08-01
Scope: **Admin panel only** (`src/pages/Admin.tsx`, `src/components/ui/tabs.tsx`). Everything outside the admin panel intentionally untouched.
Skills applied: `capacitor-performance`, `console-error-triage`, `senior-architect-audit`.

**Rating: 4.5/5** — the reported defect had a single real root cause, it is fixed and regression-tested; remaining deductions are pre-existing admin-page density and a dev-only console warning owned by the preview tooling.

---

## 1. Root cause (the bug the user kept reporting)

The Admin tab chip row clipped the active chip ("Upload" rendered as "pload") and could not be scrolled to the right end.

Two defects compounded, both in `src/components/ui/tabs.tsx`:

### [HIGH] [UX] `justify-center` on a horizontal scroller creates unreachable scroll space
`TabsList` base classes were `inline-flex h-9 items-center justify-center …`. `Admin.tsx` added `flex … overflow-x-auto` but no `justify-*` utility, so tailwind-merge kept `justify-center`. A flex container that is **both** `justify-center` and horizontally overflowing centers its content, pushing the row's start into negative scroll space the browser can never scroll to. The first visible chip is therefore permanently half-cut and the right end is unreachable.

**Fix:** `justify-start` on the Admin `TabsList`, plus an explanatory comment marking it non-removable.

### [HIGH] [MAINT] `TabsList` / `TabsTrigger` swallowed all unknown props
Both were typed `{ value?, className, children }` and spread nothing onto the DOM. `data-admin-tabs=""` and every `data-tab="…"` attribute in `Admin.tsx` were dropped, so the auto-center `useEffect` (`Admin.tsx:70`) matched nothing and had been **dead code** since it was written. Verified live: `document.querySelector('[data-admin-tabs] [data-tab="content"]')` returned `null` before the fix.

**Fix:** `TabsList` is now `forwardRef` + prop-spread; `TabsTrigger` accepts `React.ButtonHTMLAttributes` and spreads them, while composing the consumer's `onClick` with the internal tab switch. Also added `type="button"`, `role="tab"`, `aria-selected` (A11Y win).

### [MEDIUM] [PERF] `scrollIntoView` scrolls every ancestor (capacitor-performance)
The centering effect used `el.scrollIntoView({ inline: 'center' })`, which scrolls **all** ancestor scrollers — including `<main class="overflow-y-auto">` and the document. On an Android WebView that produces a visible page jump on every tab switch.

**Fix:** the effect now holds a ref to the scroller and calls `scroller.scrollTo({ left })` with a clamped target (`0 … scrollWidth - clientWidth`), one layout read inside a single `requestAnimationFrame`, and `behavior: 'auto'` when `prefers-reduced-motion` is set. Zero page-level scroll, zero layout thrash.

### [LOW] [MAINT] Dead snap classes
`snap-x snap-proximity` + per-chip `snap-start scroll-mx-1` fought the programmatic centering (snap re-aligned the chip after `scrollTo`, re-clipping it). Removed from the container and all 17 triggers. Also removed the wrapper's `overflow-hidden`, which clipped the scroller's own edges.

---

## 2. Verification (live, logged-in, 390px viewport)

Headless Chromium, real admin session, `/admin?tab=content`:

| Check | Before | After |
| --- | --- | --- |
| Scroller found via `[data-admin-tabs]` | not found (props swallowed) | found |
| `scrollLeft` on load with Upload active | `0` (chip off-screen left) | `521` (chip centered) |
| Upload chip fully inside scroller bounds | **false** | **true** |
| Chip label text | clipped | `"Upload"`, box `90×44` |
| Max right scroll reachable | no | `scrollLeft 1323 === scrollWidth-clientWidth 1323` |
| Last chip (Timetable) reachable | no | in view |

Element screenshot confirms the full "Upload" pill with icon, centered, both neighbours partially visible as a scroll affordance.

---

## 3. Console triage (`console-error-triage`)

Captured `console` + `pageerror` across admin load and tab interaction at 390px.

| # | Message | Source | Category | Verdict | Level | Action |
| - | ------- | ------ | -------- | ------- | ----- | ------ |
| 1 | `Warning: Function components cannot be given refs…` ×147 | `lovable-tagger` (`vite.config.ts:4`), dev-only plugin — fires once per component in `App`'s tree, all frames are provider components, none are app logic | OBS | **Noise** | none | Not app code, not present in production build. Do **not** add a suppression for it. |
| 2 | `pageerror` | — | — | **0 occurrences** | — | — |

No real runtime errors on the admin panel. Nothing converted to `reportError` because nothing warranted it.

---

## 4. Twelve-lens sweep (admin panel)

| Lens | Finding |
| --- | --- |
| SEC | N/A this change — admin route already gated by `isAdmin` + redirect (`Admin.tsx:127-135`); no new data paths. |
| AUTHZ | Unchanged. Server-side RLS still the enforcement point; client gate is UX only. |
| DATA | N/A — presentation-only change. |
| PERF | Improved: page-level scroll jump eliminated; heavy `TabsContent` bodies still mount-on-demand behind the `activeTab === 'X'` guard (correct, kept). |
| RELY | Effect cleans up its `rAF`; `scrollTo` target clamped so a mid-transition measurement can't produce NaN/negative. |
| UX | Primary fix. Active chip is always centered and whole; both ends reachable. |
| A11Y | Improved: triggers now expose `role="tab"` + `aria-selected`; 44px min tap target retained; reduced-motion respected. |
| OBS | Console clean apart from dev-tooling noise. |
| MAINT | Dead auto-center code revived; misleading comment replaced with the real root cause so this doesn't regress a fourth time; 3 regression tests added (`src/test/admin-tabs-scroller.test.tsx`). |
| CONFIG | No changes. |
| VIS | Chip row now reads like Linear's / Notion's horizontal tab strips: left-aligned, single row, hidden scrollbar, pill active state with a single-line shadow. Previously the centered overflow made the row look randomly offset on load. |
| MOT | Smooth scroll only when motion is allowed; 200ms token-based chip transition retained; no layout shift on tab change. |

---

## 5. Wins

- Root cause is a single CSS utility — no architectural change needed, and the fix is now guarded by a unit test that fails if `justify-center` returns or props stop forwarding.
- `TabsList` / `TabsTrigger` are used across the app; the change is purely additive (forwardRef + prop spread + a11y attrs), so no other call site changes appearance. Full suite: **278 passing / 6 skipped**, typecheck clean.

## 6. Out of scope, reported not fixed

- **Community page header overlap** (second screenshot): the "New Post" button overlaps the "Community" heading at 390px. Same class of bug (a fixed-width action colliding with a flex heading), different page. Not touched — say the word and I'll fix it.
