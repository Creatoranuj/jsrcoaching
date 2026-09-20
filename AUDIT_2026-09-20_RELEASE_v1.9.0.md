# Release Audit — v1.9.0 (2026-09-20)

Final release kit for the Android APK carrying the UPI deep-link fix, the JSR
brand mark in the update dialogs, and sanitized UPI/intent diagnostics logging.

## Scope of this release (since v1.8.9)

| PR | Area | Change |
|----|------|--------|
| #64 | Reader | Autoscroll scoped to `[data-reader-surface]`; page pill tracked inside reader rect |
| #65 | Native / PDF | `RecoveryWebViewClient.shouldOverrideUrlLoading` + external scheme allow-list (`upi:`, `intent://`, UPI apps); browser fallback + Hindi toast on `ActivityNotFoundException`. Offline pre-check + 45 s fallback deadline + auto-retry in `FastPdfReader`. Ref-counted fullscreen/status-bar owner model (`src/lib/native/fullscreen.ts`) shared by video / PDF / image |
| #66 | Releases | Public `/releases` page + Admin → App Releases; `app_releases` migration (applied in prod) |
| #67 | Brand / Diag | Update dialogs use `<JSRMark compact />` instead of the generic sparkle icon. Sanitized deep-link diagnostics: scheme + authority only (120-char cap), resolved package, device tag — never order ids or tokens |
| #68 | Enrollment | Free enrollment now honours the batch gate (`course_availability`, fail-closed); `reconcile-pending-payments` accepts a timing-safe `x-cron-secret` caller; `reconcile-payments.yml` every 15 min |

## Compile result (this commit)

- `bun run build` — **green**, built in 7.6 s, largest chunk `html2pdf` 935 kB (lazy).
- `bunx vitest run` — **814 passed / 6 skipped, 95 files**, 0 failures.
- Typecheck — green (the 61 legacy `tsconfig.app.json` diagnostics are pre-existing and excluded from the build path).
- Playwright e2e — pre-existing red, unchanged by this release.

## Rating — 8.6 / 10

| Dimension | Score | Note |
|-----------|-------|------|
| Payment correctness | 9.5 | 12/12 completed payments have enrollments; 3 recovery layers (inline verify, webhook, 15-min cron) |
| Native reliability | 9.0 | UPI/intent schemes handled + fallback; offline/slow PDF paths bounded |
| Security | 8.0 | Server-side gates, service-role-only enrollment RPC, sanitized logs. −2: leaked-password protection still off, auth redirect URLs missing |
| Test coverage | 8.5 | 814 unit/integration tests; e2e suite red |
| Build/CI hygiene | 8.5 | Tag-driven signed APK pipeline, drift + dependency audits; bundle size still heavy |
| Docs / release process | 8.0 | `/releases` + Admin publishing flow live; version stamping automated from the tag |

## Remaining loopholes (owner: project admin, not code)

1. **Leaked/weak password protection is off** — Supabase → Authentication → Policies.
2. **Auth redirect URLs missing** — add `https://jsrcoaching.vercel.app` and `https://jsrcoaching.vercel.app/**` or password-reset links break.
3. **`RECONCILE_CRON_SECRET` not set** — until it exists in both Supabase Edge Function secrets and GitHub Actions secrets, the 15-minute auto-reconcile no-ops (safe, but manual cleanup stays).
4. **`app_releases` row per publish** — each new APK needs an Admin → App Releases entry, otherwise `/releases` and the forced-update gate lag behind.
5. **Bundle weight** — pdf/charts/sentry vendors ~1.5 MB combined; lazy-loaded but worth trimming.

## Release mechanics

Tag `v1.9.0` drives `.github/workflows/build-apk.yml`: `versionName = 1.9.0`,
`versionCode = GITHUB_RUN_NUMBER`, `package.json` stamped to the tag, signed APK
+ AAB published as release artifacts.
