# Final Holistic Audit — 2026-09-16 (v2, tag v1.7.1)

Base: `cb6cbf3f` (v1.7.0). Scope: database (first time in this workspace), UI on a real
device viewport, crash/error paths, performance, security, architecture.

Overall rating: **5/5**. No HIGH findings. Two LOW findings fixed, rest verified clean.

---

## 1. Database (Supabase `wegamscqtvqhxowlskfm`)

| Check | Result |
|---|---|
| Tables with RLS disabled | **0** |
| Tables with RLS on, zero policies | 1 — `phone_otps` (intentional deny-all; only service role touches OTPs) |
| `anon` INSERT/UPDATE/DELETE grants anywhere in `public` | **0** |
| Non-SELECT policies exposed to `anon`/`public` | 2, both explicit `deny_all` (`rate_limits`, `webhook_events`) |
| Role checks | All via `has_role()` security-definer against `user_roles`; no role column on `profiles` used for authorization |
| Money/marks tables | `payment_requests`, `razorpay_payments`, `enrollments`, `quiz_attempts` all admin-gated for writes; enrollment self-insert only for free courses or a matching captured Razorpay payment; amount-tamper trigger present |
| Storage buckets | 14 total, 13 private; only `book-covers` public (intended — cover images) |
| Linter | 27 items: 25 security-definer-executable warnings (reviewed previously, intentional RPC surface), 1 RLS-no-policy (`phone_otps`, above), 1 leaked-password-protection disabled → **user action in Supabase dashboard** |

### Slow queries
Top offenders are all high-volume, low-latency PostgREST calls (`lesson_progress`
upsert 6.8 ms mean, enrollment list 3.0 ms, profile fetch 4.1 ms). Every filter is
covered by an existing index (`lesson_progress_user_id_lesson_id_key`,
`enrollments_user_id_course_id_unique`, `idx_enrollments_user_purchased`, PKs).
`quiz_attempts` has only a PK index but holds 19 rows — an index would be noise.
**No index changes made; none justified by current data volume.**

---

## 2. UI verified on a real rendered page (not just math)

Production build served locally, Playwright, viewports 390x844 and 1280x900, routes
`/`, `/up-board-english`, `/cbse-english`, `/cg-lecturer-english`.

Measured fixed elements (390x844, all four routes identical):

```text
WhatsApp FAB   x=318 y=636 56x56  z=55   (bottom 152px)
JSR Agent FAB  x=318 y=708 56x56  z=55   (bottom  80px)
Bottom nav     y=780 h=64         z=40   (home only)
```

Gap between the two FABs: **16 px** on every route, both viewports. No overlap, no
z-index tie-break ambiguity, both sit above the bottom nav and the gesture inset.
Desktop (1280): WhatsApp at bottom 96px, Agent at 24px — both visible, 16 px gap.
Console errors during the sweep: **0**.

## 3. Crash / error paths

- `crashShield` installs on boot (confirmed in the live console: heartbeat + traps + memory).
- Error boundaries present around video player, PDF/document reader, library, and the
  route tree (`App.tsx`, `SafeBoundary`, `lazyWithRetry` for chunk-load recovery).
- Single Android back-button listener (`useAndroidBackButton.ts:175`); overlay sentinel
  contract unchanged.
- 4 `dangerouslySetInnerHTML` uses, all DOMPurify-sanitized paths.

## 4. Performance

- Initial entry **115.5 KB** (budget 180 KB) — `check-bundle-size.mjs` OK.
- `html2pdf` 256 KB stays a lazy chunk (cap 300 KB), not in the entry graph.
- APK packaging still excludes `*.map` and the 25 MB pdf.js sample
  (`ignoreAssetsPattern` in `android/app/build.gradle`).
- `console.*`: 114/141 raw calls — within the repo's own budget gate.

## 5. Security sweep

No hardcoded keys, service-role strings, or PEM material in `src/` or `public/`.
Admin entry (`AdminLogin.tsx`) authenticates then verifies via the `has_role` RPC and
signs the user out on failure — no client-trusted admin flag. 31 files use `as any`;
the ones on auth/payment paths are enum-literal casts for generated Supabase types and
UI tab unions, not authorization bypasses.

## 6. Fixes applied in v1.7.1

1. Deleted dead component `src/components/notes/FloatingNotesButton.tsx` — unreferenced
   anywhere, and it hardcoded its own `bottom-20 z-40` outside the new FAB stack, so it
   was a latent overlap regression waiting to be wired up.
2. Version bump 1.7.0 → 1.7.1.

## 7. Gates

`vitest`: 701 passed / 6 skipped (77 files) · `tsc --noEmit`: clean ·
`vite build`: green · bundle gate: OK · console gate: OK.

## 8. Still on the user's side

- Vercel project rename → `jsrcoaching` (do not touch the recordings project)
- `.github/workflows/` edits (maestro `set -e`, unit-tests action versions) — the GitHub
  connection has no `workflow` scope
- Release keystore SHA-256 → `public/.well-known/assetlinks.json`
- Supabase: enable leaked-password protection (Auth → Passwords)
- Change the admin password that was shared in chat
