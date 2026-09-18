# Audit: Admin Panel (src/pages/Admin*.tsx, src/components/admin/**, useAdminEnrollment, admin lib/config)

**Rating: 4/5** — a genuinely well-engineered admin surface (server-side role checks, idempotent enrollment/payment writes, optimistic-concurrency guards, virtualization, memoized tabs) let down by a handful of inconsistent confirmation flows and visual-craft debt that keep it off a 5.

## Findings

### [HIGH] [DATA] Role change is delete-then-insert, not atomic
**Where:** `src/pages/Admin.tsx:254` (`handleChangeRole`)
**Why it matters:** `user_roles` row is deleted first, then a new row is inserted in a second round-trip. If the insert fails (network blip, RLS hiccup, validation error) after the delete succeeds, the user is left with **no role at all** — silently losing access to student features until an admin notices and manually re-grants. This is a real "double network call, no rollback" data-integrity bug in a privileged path.
**Fix:** PROPOSED — replace with a single upsert (`update ... where user_id=x` if a row exists, else insert) or move to a `SECURITY DEFINER` RPC (`set_user_role(uid, role)`) that does the swap in one transaction server-side. Needs a migration, so left as proposed rather than applied.

### [MEDIUM] [AUTHZ] Promoting a user to admin had no confirmation step
**Where:** `src/pages/Admin.tsx:254` (`handleChangeRole`)
**Why it matters:** Every other high-impact action in this codebase (approve payment, reject payment, revoke enrollment, refund, force logout) goes through `useConfirm()`. Granting **admin** — the highest privilege in the app — was a single dropdown click with zero friction, unlike a role's demotion or an enrollment revoke. A fat-fingered select becomes a silent privilege escalation.
**Fix applied:** Added a `confirmAction({ variant: "destructive" })` gate before any change to `"admin"`, matching the existing pattern used elsewhere in the same file.

### [MEDIUM] [UX/A11Y] Native `window.confirm()` used instead of the shared `ConfirmDialog` in three destructive admin paths
**Where:** `src/pages/AdminStudyMaterials.tsx:184`, `src/pages/AdminTrustedHosts.tsx:118`, `src/components/admin/AdminLessonAttachments.tsx:87`
**Why it matters:** The app ships a themed, accessible `useConfirm()` (focus-trapped `AlertDialog`, keyboard support, consistent copy) used everywhere else for destructive actions. `window.confirm()` is unstyled, can be suppressed/auto-dismissed inside a Capacitor WebView, and breaks visual consistency — an admin deleting a study material sees a jarring native browser dialog instead of the in-app one used one screen over for the same kind of action.
**Fix applied:** Swapped all three call sites to the existing `useConfirm()` context (same destructive variant/copy), no behavior change to what gets confirmed.

### [LOW] [VIS] Hardcoded hex colors bypass the design-token system
**Where:** `src/components/admin/HeroBannerManager.tsx:60,521,529,535-539`
**Why it matters:** Preset gradient swatches (`#1d4ed8`, `#f97316`, etc.) are hardcoded instead of referencing theme tokens. Harmless for a "pick a banner color" swatch picker (these are meant to be literal color choices for content, not UI chrome), but if the design system's palette shifts, these presets silently drift from the rest of the brand.
**Fix:** Not applied (cosmetic/content-authoring feature, not a design-system violation worth a behavior-risking edit) — flag for the next design-token pass.

### [LOW] [A11Y] Several icon-only destructive/move buttons render under the 44px tap-target minimum
**Where:** `src/pages/AdminChatbotSettings.tsx:977` (`h-7 w-7` delete), `src/pages/AdminLiveManager.tsx:282,285` (`h-8 w-8` icon buttons)
**Why it matters:** These are 28px/32px hit areas on mobile-first admin surfaces used inside a Capacitor app — below the 44×44 accessibility guidance, increasing mis-tap risk especially for a delete action.
**Fix:** PROPOSED — bump to `h-9 w-9`/`min-h-[44px] min-w-[44px]` with padding; not applied here because it's spread across many unrelated files/tabs and touches visual rhythm the audit scope asked to leave alone unless it's a clear bug.

## Wins
- **Server-side authority, not client trust**: `AdminRoute` gates on `useAuth().isAdmin`, which is backed by a `has_role()` RPC reading `user_roles` — `src/lib/adminConfig.ts` explicitly documents that the old hardcoded-email check was removed. Admin account creation (`AdminRegister.tsx`) goes through a server function gated by a secret code, not client logic.
- **Idempotent, race-safe payment approval**: `handleApprovePayment` re-verifies the course price at approval time, upserts the enrollment with `onConflict` before flipping payment status, and uses `.eq('status', 'pending')` as optimistic concurrency so a double-click or two admins can't double-grant or double-process the same request.
- **Enrollment grant/revoke** (`EnrollmentManager.tsx`, `useAdminEnrollment.ts`) is upsert-based with a `UNIQUE(user_id, course_id)` constraint — genuinely idempotent, with a clear comment about a prior `42501` RLS incident and how it was diagnosed.
- **Refund flow** requires typing the literal word `REFUND` before the button unlocks, with a clear warning about partial vs. full refund access implications — a strong pattern worth reusing.
- **Performance-conscious**: admin tab panels are `lazyWithRetry`-loaded per tab, tab components are memoized against unrelated parent re-renders, and the enrollment list is virtualized (`react-window`) for 200+ rows.
- Loading/empty states are consistently present across the tabs reviewed (spinners + "No X found" messaging in Payments, Users, Enrollments).

## Fix Plan
1. **Applied now (low-risk):** confirm-before-grant-admin; replaced 3 native `confirm()` calls with the shared dialog.
2. **Next PR (proposed, needs migration):** atomic role-change RPC to remove the delete/insert data-loss window.
3. **Backlog:** audit icon-button tap targets across all Admin*.tsx for 44px minimum; consider tokenizing HeroBannerManager preset swatches if the palette becomes brand-governed.
