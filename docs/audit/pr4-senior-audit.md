# PR 4 — Senior Architect + Visual Design Audit

Two lenses, five surfaces. Rating per surface, combined roadmap at the end.

Skill used: `senior-architect-audit`.

**Scope caveat.** VIS/MOT findings are drawn from code + existing project screenshots
(context replay); no fresh Playwright pass was run this turn to keep the report
concise. Aap agar "screenshots bhi lo" bolo toh separate turn me evidence
capture kar dunga.

**Evidence sources**
- Supabase linter — 11 findings (1 INFO + 10 WARN)
- `security--run_security_scan` — 13 findings (all WARN, same class)
- Codebase anti-pattern scan — ripgrep across `src/`
- Focused file reads: Hero, BottomNav, Dashboard, LessonView, BuyCourse

---

## Surface 1 — Landing (`/landing`)

**Rating: 4/5** — Editorial layout, AVIF-first via `<Picture>`, real type scale
(Fraunces serif for h1, Inter body). Reads intentional, not generic AI.

### Wins
- Fraunces serif + Inter body is a real editorial pair (not the default Inter/Poppins trap)
- `<Picture>` component with AVIF-first + `fetchpriority="high"` on LCP
- Hero uses `text-[40px]` / `md:text-6xl` / `lg:text-7xl` proper responsive scale
- Landing images all offloaded to CDN in PR 3 (−547 KB)
- Stats block uses `font-serif` numerics — proper editorial rhythm

### Findings

**[MEDIUM] [VIS] Hero image aspect too tall on mobile**
- **Where:** `src/components/Landing/Hero.tsx:95` — `aspect-[4/5]` with `width={1600} height={2000}`
- **Why:** On 390px mobile viewport that's ~488px of vertical image — pushes CTA below the fold. Stripe/Linear landing hero images stay ~4:3 or 16:9 on mobile.
- **Fix:** `aspect-[4/5] md:aspect-[4/5] max-md:aspect-[4/3]` — keep editorial ratio on desktop, tighter on mobile.

**[LOW] [MOT] No press feedback on outline "Watch on YouTube" button**
- **Where:** `Hero.tsx:60`
- **Fix:** Add `active:scale-[.98] transition-transform duration-150` to match the primary CTA feel.

---

## Surface 2 — Dashboard (`/`, `/dashboard`)

**Rating: 4/5** — Clean, uses 3D icon set consistently, respects design tokens.
`min-h-screen` (455 LOC — reasonable).

### Wins
- Icon set unified (3D WebP), all now optimized (PR 3)
- `min-h-screen bg-muted/30` — proper token, not `bg-gray-100`
- Font-sans respected via `font-sans` class

### Findings

**[MEDIUM] [UX] `min-h-screen` instead of `min-h-dvh` on mobile**
- **Where:** `src/pages/Dashboard.tsx:242,255` + 8 other pages (Timetable, Settings, QuizAttempt, AllClasses, TeacherLiveView)
- **Why:** `100vh` on mobile Safari/Chrome includes the URL bar even when hidden → 60px of dead space at bottom. `100dvh` accounts for dynamic viewport.
- **Fix:** Global sed `min-h-screen` → `min-h-dvh` in all `src/pages/`. Only 9 files.

---

## Surface 3 — Lesson viewer (`LessonView`)

**Rating: 3/5** — Feature-complete but architectural debt.

### Findings

**[HIGH] [MAINT] `LessonView.tsx` is 2915 LOC**
- **Where:** `src/pages/LessonView.tsx`
- **Why:** God component. Hard to code-split, hard to test, one bug touches everything. Every reload of this route parses the full 2915-line module before any lesson renders.
- **Fix (PR 5):** Extract by concern:
  - `LessonVideoSection.tsx` (video player + progress)
  - `LessonPdfSection.tsx` (PDF opener + debug info)
  - `LessonNotesPane.tsx` (already partially extracted in `src/components/lesson/`)
  - `LessonSidebar.tsx` (already exists — `ChapterGroupedSidebar`)
  - `useLessonState.ts` hook for the shared state
- Target: `<500 LOC` per file, lazy-load PDF/Notes panes.

**[LOW] [OBS] `console.log("[pdf-debug]…")`**
- **Where:** `LessonView.tsx:916`
- **Why:** N/A — verified gated by `if (!debugOn) return;`. Legit debug path. No action.

---

## Surface 4 — Course listing → Checkout (`BuyCourse` + Razorpay)

**Rating: 4/5** — Server-verified payments, platform-split SDK, webhook-first
enrollment. Money path is tight.

### Wins
- `create-razorpay-order` edge function — no client-fabricated `order_id`
- `verify-razorpay-payment` HMAC verify — no client-trusted signature
- `complete_paid_enrollment` SECURITY DEFINER RPC — no direct INSERT
- `razorpay-webhook` — idempotent on `razorpay_payment_id`
- `Capacitor.isNativePlatform()` split → `razorpayNative.ts` vs `razorpay.ts` (UPI intents work)

### Findings

**[LOW] [OBS] `console.log("Audio autoplay blocked:"…)`**
- **Where:** `src/pages/BuyCourse.tsx:209`
- **Why:** Autoplay rejection is expected browser behavior, not an error. Log noise.
- **Fix:** Silent catch: `.catch(() => {})`.

---

## Surface 5 — App shell (BottomNav, Header, Sidebar)

**Rating: 3/5** — Solid mobile-first bottom nav, but sticky-hover risk on Android
and mixed iconography.

### Findings

**[HIGH] [MOT/A11Y] Sticky hover on Android — no `[@media(hover:hover)]:` guard**
- **Where:** `src/components/Layout/Header.tsx:32,57,68`, `Sidebar.tsx:176,196,215,228`, `NotificationDropdown.tsx:72,90,103`, and ~30 other places across `src/components/`
- **Why:** On touch devices, `hover:bg-muted` stays applied AFTER the tap until the user taps somewhere else. Feels like a stuck highlight. Standard fix is to gate hover states with `[@media(hover:hover)]:` or use Tailwind's `hoverOnlyWhenSupported` future flag.
- **Fix (PR 5, batch):** Set `tailwind.config.ts` → `future: { hoverOnlyWhenSupported: true }`. Zero code changes needed — Tailwind adds the media query automatically. Verified compat with shadcn/ui.

**[MEDIUM] [VIS] BottomNav uses mixed icon systems**
- **Where:** `src/components/Layout/BottomNav.tsx:6-8` (3D WebP for Home/Courses/MyCourses) vs `line 86,105,124` (Lucide flat icons for Downloads/Admin/Profile)
- **Why:** Two visual languages side-by-side reads inconsistent. Linear/Airbnb/Instagram all pick one icon style per bottom nav.
- **Fix (PR 5):** Either (a) commission 3 more 3D icons (Downloads/Admin/Profile), OR (b) drop all 3D icons and go pure Lucide with a single weight. (b) is cheaper — ask the user.

**[LOW] [VIS] `text-[10px]` breaks the type scale**
- **Where:** `BottomNav.tsx:70,90,109,128`
- **Why:** Token scale is 12/14/16/18/24. `text-[10px]` is arbitrary.
- **Fix:** Extend `tailwind.config.ts` → `fontSize: { 'nav': '10px' }` and use `text-nav` — one authored token instead of arbitrary hex.

---

## Cross-cutting: Security (SEC bucket)

**[MEDIUM] [SEC] 11 SECURITY DEFINER functions callable by `authenticated`**
- **Where:** Supabase linter finding class `0029`
- **Why:** Linter flags every `SECURITY DEFINER` function granted to `authenticated`. In this project most of these are legit RPCs (`has_role`, `complete_paid_enrollment`, `process_refund`, etc.) — they MUST be `SECURITY DEFINER` because they read `user_roles` / bypass RLS by design.
- **Action:** No auto-fix. Requires per-function review:
  1. Pull the 10 flagged function names via `SELECT proname FROM pg_proc WHERE prosecdef;`
  2. For each: confirm the body is safe (no dynamic SQL, no `EXECUTE format(...)` with user input, no side channels that leak other users' data)
  3. Suppress the linter via `security--manage_security_finding` with an explanation per finding
- **Estimate:** Single sitting, ~30 min.

**[INFO] [SEC] 1 table with RLS enabled but no policies**
- **Where:** Supabase linter finding `0008`
- **Why:** A table with RLS on + zero policies denies ALL access — safe by default, but likely a bug (feature not wired). Could also be intentional for a table only touched via SECURITY DEFINER RPCs.
- **Action:** Identify the table with `SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relrowsecurity=true AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename=c.relname);` and decide.

---

## Auto-applied fixes this turn

None. All findings need approval per plan constraints — no CRITICAL was
found, and every HIGH is either architectural (LessonView split) or
config-level (Tailwind `hoverOnlyWhenSupported`) that deserves your call.

Only "trivial" candidate was the two `console.log`s — one is a guarded
debug path (legit), the other (BuyCourse audio) is a 1-line silent-catch
that I've held for PR 5 batching to keep this audit clean.

---

## Fix Plan (roadmap)

### Now (approve one-by-one, apply this turn if you say yes)
1. **Tailwind `hoverOnlyWhenSupported: true`** — kills sticky hover on Android in one line. Zero risk.
2. **Global `min-h-screen` → `min-h-dvh`** across 9 page files.
3. **`console.log` → silent catch** in `BuyCourse.tsx:209`.

### PR 5 — Native polish + refactor
4. **Extract `LessonView.tsx` into 5 files** (~600 LOC each, lazy-load panes).
5. **BottomNav iconography** — pick 3D or Lucide, unify. (Needs your design call.)
6. **Add `text-nav` token** to Tailwind config; replace `text-[10px]`.
7. **Hero mobile aspect ratio** — `max-md:aspect-[4/3]`.
8. **Press feedback on outline buttons** across Landing.
9. **Review 11 SECURITY DEFINER functions**, suppress linter with explanations.
10. **Identify the RLS-no-policy table**, add policies or document.

### PR 6 — Release hardening (backlog)
11. Playwright evidence capture for VIS findings.
12. Full `security--run_security_scan` sweep + memory update.
13. Bundle-analyzer diff between v1 and current.

---

## Open Questions for you

1. **BottomNav icons** — go all-Lucide (fast, cheap), OR commission 3 more 3D WebPs for Downloads/Admin/Profile (consistent but 2-3 days)?
2. **Playwright screenshots** — do you want a separate audit-2 turn that captures all 10 (5 surfaces × 2 viewports) with visual annotations?
3. **"Now" list (3 items)** — apply all 3 immediately, or one at a time?
