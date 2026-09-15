# Safar English — Lovable Project Knowledge

> Paste this into **Lovable → Project Settings → Knowledge** (≤10,000 chars).
> This is the "always-on" context. Skill-specific detail lives in `.agents/skills/*` and `docs/`.

---

## 1. What this app is

**Safar English** (Mahima Academy) — a Capacitor-wrapped React 18 + Vite + TypeScript education platform for grades 1–5. Ships as:

- **Web** (Vercel) at `id-preview--…lovable.app` and custom domain
- **Android APK** via Capacitor (`com.safarenglishka.app`) — production builds are self-contained from `dist/`
- **iOS** target exists but Android is primary

Backend is **Supabase** (project ref `cmbattmjwriiesibayfk`, name "Safar English"). 76 tables, RLS enforced everywhere, roles in a separate `user_roles` table (never on `profiles`).

---

## 2. Stack & non-negotiables

- React 18 + Vite 5 + TS 5 + Tailwind v3 + shadcn/ui
- TanStack Query for server state; React Context for Auth/Theme/Batch/NavigationHistory
- Supabase JS v2 client at `src/integrations/supabase/client.ts` — **never** edit `types.ts` by hand
- Capacitor 6 with plugins: SplashScreen, StatusBar, Keyboard, App, Browser, Filesystem, Push, plus a custom `capacitor-plugin-nb-pdf`
- Razorpay via `razorpay-capacitor` (native) with web mock fallback
- Bunny CDN for video, custom PDF.js viewer under `public/pdfjs/`

**Rules that apply to every change:**

1. Use design tokens from `src/index.css` — never hardcode `text-white`, `bg-[#...]`, or raw hex in components. Dark mode must keep working.
2. All Supabase writes go through hooks in `src/hooks/` — do not sprinkle `supabase.from(...)` inside pages.
3. Roles are read via `has_role(auth.uid(), 'admin')` in RLS and via `useAuth().isAdmin` in the client. Never gate admin UI by email/localStorage.
4. Every `CREATE TABLE public.*` migration MUST include `GRANT` before `ENABLE RLS` before `CREATE POLICY`. Migrations without GRANTs are rejected.
5. Never commit `server.url` in `capacitor.config.ts` — it must stay empty so APK ships self-contained. Live-reload URLs go in an untracked local override.
6. `webContentsDebuggingEnabled` is gated on `process.env.CAP_DEBUG === '1'`. Production APK ships with it OFF. Do not flip the default.

---

## 3. Directory map (frog-eye)

```
src/
  pages/              route-level (Admin*, Course, LessonView, Library, LiveClass, BuyCourse, PaymentCallback, …)
  components/         shadcn + feature components (AdminEruda, SplashHider, video/, pdf/, admin/)
  contexts/           AuthContext, ThemeContext, BatchContext, NavigationHistoryContext
  hooks/              useCourses, useEnrollments, useLessons, useMessages, useAttendance, useProfiles, …
  integrations/supabase/  client.ts, types.ts (generated), auth-middleware.ts
  lib/                sentry, nativeDebug, lazyWithRetry, crashShield, keyboard insets, back-nav
  utils/              razorpay(Native), paymentApi, downloadLessonNotes, version, fileUtils
  config/             backNavigation.ts, buildFlags.ts
  test/               vitest specs (pdf, definer-grants, format-chips, version)
supabase/
  functions/          32 edge functions (razorpay-*, bunny-cdn, pdf-proxy, get-lesson-url, chatbot, security-regression, …)
  migrations/         timestamped SQL — managed only by the migration tool
capacitor-plugin-nb-pdf/  local Capacitor plugin for native PDF handoff
android/ ios/         native projects (generated; committed)
public/pdfjs/         self-hosted PDF.js viewer with nb-bridge.js
scripts/              build-apk-local, logs-android/ios, crash-dump-android, measure-perf, verify-capacitor-deps
docs/                 audits, capacitor guides, security checklists, release QA
  e2e/ maestro/         Optional local QA references only; no GitHub workflow currently runs them
```

---

## 4. Auth, roles, RLS (senior-architect lens)

- `user_roles` (enum `app_role`: admin/teacher/student) is the ONLY source of truth for authorization.
- Security-definer functions do the checks: `has_role`, `get_user_role`, `verify_enrollment_for_attendance`, `get_platform_stats`, `get_quiz_questions`, `complete_paid_enrollment`, `process_refund`.
- Triggers to preserve: `prevent_self_role_escalation`, `prevent_enrollment_status_tampering`, `stamp_payment_request_actor`, `validate_payment_request_amount`, `handle_new_user`, `handle_new_user_role`, `audit_leads_access`.
- **audit_log** table records privileged actions (enrollment_completed, refund_processed, leads access). Keep writing to it from every new SECURITY DEFINER function that mutates payments/enrollments/roles.
- Rate-limiting via `check_rate_limit(bucket, user_id, max, window_seconds)` — reuse it before adding new rate-limit tables.
- Storage buckets: public → `avatars`, `comment-images`, `book-covers`; private → `course-videos`, `course-materials`, `receipts`, `student-notes`, `chat-attachments`, `lesson-attachments`, `pdf-cache`, `lecture-pdfs`, `content`. Never make a private bucket public without an RLS review.

---

## 5. Payments (Razorpay) — critical path

- Order creation → edge function `create-razorpay-order` / `create-subscription-order`.
- Native checkout → `src/utils/razorpayNative.ts` + `razorpay-capacitor` plugin (dynamic import so web bundle doesn't break).
- Verification is server-side ONLY: `verify-razorpay-payment` + `razorpay-webhook` (HMAC-SHA256 of `${order_id}|${payment_id}`). Never trust the client success callback.
- Enrollment activation goes through `complete_paid_enrollment(...)` RPC — do not `INSERT INTO enrollments` directly from the client for paid courses.
- Refunds via `initiate-refund` → `razorpay-refund-webhook` → `process_refund(...)` RPC.
- `payment_events` and `webhook_events` provide idempotency + audit. Always insert into `webhook_events` before doing side-effects.

---

## 6. Capacitor lens (debugging-capacitor skill)

- Splash: JS-controlled via `SplashHider.tsx`; safety timeout 2s so it never hangs.
- Status bar overlays WebView; safe-area via CSS `env(safe-area-inset-*)`. Every `fixed`/`sticky` element must respect insets.
- Keyboard resize mode is `native`; `--nb-keyboard-h` CSS var is set by `installKeyboardInsetTracker` — use it for footers.
- Back-button handler is mounted **once** (see `src/config/backNavigation.ts` + `NavigationHistoryContext`). Do not add a second `App.addListener('backButton', …)`.
- Native plugins are lazy-imported and wrapped in try/catch with a web fallback (see `razorpayNative.ts`, `capacitor-plugin-nb-pdf`).
- Deep links + assetlinks live in `public/.well-known/`. Bump both together when the app id or domain changes.
- Native logs: `scripts/logs-android.sh`, `scripts/logs-ios.sh`. Crash dump: `scripts/crash-dump-android.sh`.
- APK build: `scripts/build-apk-local.sh`. After schema/native edits, tell the user to `git pull && npm i && npx cap sync`.

---

## 7. Console & error triage (console-error-triage skill)

- `console.error` is forwarded to Sentry in production via `installConsoleErrorForwarder` in `src/lib/sentry.ts`. A noisy console = a noisy Sentry bill.
- Preferred helper in new code: `reportError(err, { surface: '<hookOrComponent>' })` from `src/lib/sentry.ts`. Use `addBreadcrumb(...)` before risky ops (PDF open, payment, deep link).
- Known noise (already suppressed in `src/lib/nativeDebug.ts`, do NOT re-suppress globally): `AbortError` from react-query/react-notion-x unmount, `Keyboard.setResizeMode … UNIMPLEMENTED` on web, `ResizeObserver loop limit`, Supabase `PGRST116` on `.maybeSingle()`.
- Admins get in-app DevTools (Eruda) via `AdminEruda.tsx` — gated by `useAuth().isAdmin` + `nb_admin_eruda` localStorage flag. Non-admins never download the chunk.
- Append `?debug=1` to any route for the on-device console overlay from `nativeDebug.ts`.
- Chunk-load failures are handled by `src/lib/lazyWithRetry.ts` — use it for every `React.lazy` import.

---

## 8. Data-fetching conventions

- Every list hook returns `{ data, isLoading, error }` from TanStack Query and sets `staleTime` explicitly.
- `useEffect(() => { fetch… }, [])` must include an `AbortController` cleanup — see existing hooks for the pattern.
- Realtime: subscribe inside `useEffect`, always `supabase.removeChannel(channel)` on cleanup. Never subscribe at module scope.
- Supabase query limit is 1000 rows — paginate anything that can grow (messages, enrollments, quiz attempts, lesson_progress).

---

## 9. What NOT to do (constraint memory)

- Do not add a service worker / vite-plugin-pwa unless the user explicitly asks for offline. Prior attempts caused reload loops.
- Do not add `cleartext: true` or `allowMixedContent: true` to `capacitor.config.ts`. Currently both are off — keep them off.
- Do not store roles, JWTs, or Razorpay secrets in `localStorage` or in any Supabase table.
- Do not call edge functions by URL path (`/api/...`). Use `supabase.functions.invoke()` or build the URL from `import.meta.env.VITE_SUPABASE_PROJECT_ID`.
- Do not modify `supabase/migrations/*` files by hand — only via the migration tool.
- Do not re-introduce `CapacitorUpdater`/Capgo — it was removed intentionally; updates ship via Play Store.
- Do not hard-code the Lovable sandbox URL in `capacitor.config.ts` `server.url` — it leaks environments.

---

## 10. Verification checklist before shipping

1. `npm run build` clean, no TS errors.
2. `bunx vitest run` green (or targeted `src/test/*`).
3. Supabase linter: no new CRITICAL/HIGH; document any pre-existing warning left in place.
4. Console clean on `/`, `/courses`, `/lesson/:id`, `/buy/:courseId`, `/admin` — no unstructured `console.error`.
5. On Android APK: cold-start under 3s, back button exits from root only once, keyboard doesn't cover input footers, payment flow returns to `PaymentCallback` with correct state.
6. If migration touched RLS: run `security-regression` edge function and confirm it passes.

*Frog-eye view. Deeper playbooks: `.agents/skills/*` and `docs/AUDIT-*.md`.*
