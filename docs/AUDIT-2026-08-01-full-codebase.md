# Full Codebase Audit — 2026-08-01

Scope: entire repo (94,963 LOC across src), Supabase backend (RLS, triggers, grants,
functions), Capacitor native config, edge functions, dependencies, tests.
Lenses applied: app-crash-shield, asset-optimization, capacitor-back-button,
capacitor-video-player-master, console-error-triage, mobile-view-expert,
senior-architect-audit, soft-touch, supabase-architect-auditor,
red-team-security-audit, perf-exam-ready, sentry-triage.

**Overall rating: 4 / 5** — production-ready with no P0. Four P1/P2 items below.

---

## 1. Crash shield / memory (PASS)

No unguarded leak found across the requested categories.

| Category | Result |
| --- | --- |
| `supabase.channel()` without `removeChannel` | 0 (13 call sites, all cleaned up) |
| `addEventListener` without cleanup in components | 0 (module-level singletons are intentional) |
| `setInterval` / `setTimeout` without clear | 0 |
| `URL.createObjectURL` without `revokeObjectURL` | 0 (8 call sites) |
| Video/PDF release on unmount | OK — `BunnyStreamPlayer` blanks iframe `src`, players remove fullscreen/popstate/visibility listeners |
| `ErrorBoundary` reload loop | Guarded — `nb_eb_auto_reload_at` 60s cooldown in session+localStorage (`src/components/ErrorBoundary.tsx:36-48`) |
| Capacitor back-button duplicate listeners | Guarded — module singleton + `setupPromise` (`src/hooks/useAndroidBackButton.ts:149-400`), covered by regression test |

---

## 2. Supabase / security (PASS with warnings)

Verified live against the database:

- All security triggers **attached and enabled**: `trg_enforce_enrollment_payment`,
  `guard_enrollment_update_trg`, `trg_prevent_enrollment_status_tampering` (enrollments),
  `prevent_self_role_escalation_trg` (user_roles),
  `trg_prevent_profile_moderation_tampering` (profiles),
  `trg_quiz_attempts_sanitize_insert` + `trg_quiz_attempts_lock_score` (quiz_attempts),
  `guard_security_event_insert_trg`, `rate_limit_lead_insert_trg`.
- RLS enabled on **every** public table. Only `phone_otps` has 0 policies — that is
  deny-all by design and `anon` has no SELECT privilege on it (verified).
- Elevated roles in `user_roles`: 3. No self-escalation path (trigger blocks it).
- Dependency scan: **no high/critical vulnerabilities**.

### P1 — 4 legacy unpaid active enrollments
`enrollments` rows 21, 30, 35, 37 on course 15 ("Knowledge Hub", ₹199) are `active`
with **zero** payment rows. All were created *before* the payment trigger was attached
(2026-02-08 → 2026-07-31 07:25). New paid enrollments are now blocked correctly.
Action: revoke via `admin_revoke_enrollment(id, reason)` or whitelist via
`admin_mark_enrollment_legit(id, note)` if they were intentional grants.

### P2 — Open scanner warnings (4, all `warn`)
- `SUPA_auth_leaked_password_protection` — must be toggled in the Supabase Dashboard
  (Authentication → Policies). Cannot be fixed from code.
- `SUPA_pg_graphql_anon_table_exposed` / `..._authenticated_table_exposed` — remaining
  objects are the intentionally public marketing tables.
- `SUPA_authenticated_security_definer_function_executable` — the `admin_*` RPCs are
  SECURITY DEFINER by design; each one re-checks `has_role(auth.uid(),'admin')` internally.

---

## 3. Mobile / UI (PASS with P2)

- Global bottom-nav spacing works app-wide: `body[data-has-bottom-nav]` reserves
  `env(safe-area-inset-bottom) + 64px` (`src/index.css:837-844`).
- `formatGrade` is applied consistently in all 8 grade-rendering sites — no
  "Class Class 12" duplication remains.
- Runtime scan at 390px on public routes: **no horizontal overflow**.

### P2 — Inner scroll containers ignore the global bottom-nav padding
Pages that scroll inside their own `overflow-y-auto` / `ScrollArea` (Admin pages,
`src/pages/Doubts.tsx:715`) do not inherit the body padding; their last row can sit
under the tab bar. Fix: add `pb-20` inside those scrollers.

### P2 — Fixed-px scroll heights on narrow screens
`h-[500px]` / `h-[400px]` ScrollAreas in `Admin.tsx` (737, 855, 913, 953, 1052),
`AdminChatbotSettings.tsx` (633, 855, 956, 994), `AdminCMS.tsx` (495, 590, 733),
`AdminUpload.tsx:1416` overflow a 360×640 device. Fix: `max-h-[calc(100dvh-220px)]`.

### P3 — 82 `<img>` tags lack `loading="lazy"` and intrinsic width/height
Largest CLS impact on the public landing route (`Landing/HeroIllustration.tsx`,
`Landing/Footer.tsx`, `Layout/Header.tsx`, `Layout/Sidebar.tsx`).

---

## 4. Assets / performance (P3)

`public/pdfjs/` ships ~4.4 MB unconditionally: `pdf.worker.mjs` 2.1 MB,
`pdf.sandbox.mjs` 711 KB, `pdf.mjs` 600 KB, `viewer.mjs` 562 KB, plus ~560 KB of
Liberation TTF fonts. These are `public/` files (not bundled into the app shell) and
are fetched only when the PDF reader opens — but they do inflate the APK. Dropping the
standard-font TTFs and `pdf.sandbox.mjs` (only needed for embedded JS in PDFs) would
save ~1.3 MB of APK size.

Positive: 55+ routes are lazy via `lazyWithRetry`; only `Index`, `Login`, `PhoneLogin`
are eager (correct critical path).

---

## 5. Console / logging (PASS)

Only 9 `console.log` in the whole of `src/`, all in debug-named modules
(`pdfLog.ts`, `webVitals.ts`, `crashShield.ts`, `AdminEruda.tsx`, `main.tsx`).
No console-error noise in the runtime scan apart from React dev-mode `forwardRef`
warnings (dev only, not shipped).

---

## 6. Tests / typecheck

- Typecheck: **clean**.
- Vitest: 250 passed / 12 failed / 6 skipped (31 files).
  All 12 failures are **test-side**, not app bugs:
  - `Login.test.tsx` (10) — `getByRole("button", {name:/sign in/i})` now matches more
    than one element after the login page gained a second sign-in affordance;
    the query needs `getAllByRole` or a more specific name.
  - `pdf-system.test.ts` (2) — IndexedDB URI + autoscroll assertions.
  - `signedSmokeRegression.test.ts` (1) — bottom-nav test id expectations.

---

## Priority queue

| P | Item |
| --- | --- |
| P1 | Resolve the 4 legacy unpaid active enrollments (revoke or whitelist) |
| P1 | Enable leaked-password protection in the Supabase Dashboard |
| P2 | Add `pb-20` inside inner scroll containers on Admin pages + Doubts |
| P2 | Replace fixed `h-[500px]`/`h-[400px]` ScrollAreas with `max-h-[calc(100dvh-…)]` |
| P2 | Fix the 12 stale test assertions |
| P3 | `loading="lazy"` + width/height on landing images |
| P3 | Trim ~1.3 MB of unused pdfjs assets from the APK |
