# Live verification + backend loophole audit — 2026-09-20

Target: https://jsrcoaching.vercel.app (production web build)
Method: headless Chromium, real student account, mobile viewport (411x1800).
DB verdicts come from live `SELECT`s against the production Supabase project
(`wegamscqtvqhxowlskfm`), not from migration files.

## 1. Lesson view — FIXED (verified live)

| Step | Result |
| --- | --- |
| `/login` → sign in | OK |
| `/my-courses` | OK — 3 enrolled courses, dates + progress correct |
| `/my-courses/34` (course that crashed) | OK — subjects, lecture counts, study material render |
| "Kuchh atak gya hai" crash screen | Never appeared |
| Console errors / 4xx-5xx responses during session | **0 / 0** |

The TDZ crash (`Cannot access 'Er' before initialization`, Sentry APP-18) does
not reproduce on the deployed build.

## 2. Deep-link bounce — FOUND AND FIXED THIS SESSION

Reproduced: navigating **directly** to `/classes/34/lessons` with a valid
session either sat on a bare "Loading" screen or redirected to `/login`.

Root cause: `AuthProvider` flips `isLoading` to `false` after a 6s ceiling so a
stuck `getSession()` can never freeze the app. `ProtectedRoute` read that as
"not signed in" and redirected — and dropped the target URL, so even after
re-login the student did not land on the lesson.

Fix:
- `src/lib/authStorage.ts` (new) — `hasStoredSupabaseSession()` reads the
  persisted `sb-<ref>-auth-token` key as a *hint only* (never authorisation).
- `AuthContext` — new `sessionSettled` flag, true only when `getSession()`
  actually resolves, so the 6s ceiling now means "unknown", not "signed out".
- `ProtectedRoute` — keeps waiting (ceiling 12s) while a token is on disk and
  the session has not settled; on a real miss it redirects **with**
  `state.from`, which `Login` already honours.
- `src/test/authStorage.test.ts` — 3 regression tests.

This is the same code path the payment-return deep link and shared lesson links
use, so it also removes a post-payment "please log in again" dead end.

## 3. `/auth` 404 — FIXED

`/auth` returned the 404 page (real page is `/login`). Added a redirect route.

## 4. Backend loopholes (live DB reads)

| Loophole | Verdict | Proof |
| --- | --- | --- |
| Paid enrollment without payment | **CLOSED** | INSERT policy requires `price <= 0` OR a matching `razorpay_payments` row with `status='completed'`; admin-only ALL policy otherwise |
| Role escalation via writable role column | **CLOSED** | No `role` column on `public.profiles`; `user_roles` writes are admin-only and admins cannot edit their own row (`user_id <> auth.uid()`); users may only read their own role |
| `content` bucket public | **CLOSED** | `storage.buckets` shows `content` → `public = false`. Only `book-covers` remains public (book thumbnails, intended) |

No schema change was needed or applied.

## 5. Payment redirect logic — end to end

1. **Pay Securely** → server creates the Razorpay order.
2. Native Android → the **native Razorpay sheet** opens in-app (UPI app tiles
   visible). Web → JS checkout.
3. Sheet fails to open → the app retries the **same order once, in-app**
   (`nativeRetryRef < 1`). No navigation, no charge.
4. Second failure → stop. Show a plain message plus an **opt-in** button,
   "Browser checkout se pay karein" (`showBrowserEscape`). Nothing auto-opens.
5. Only on that tap does `openBrowserCheckout()` hand the same order to the
   phone's **system browser** (`preferWebView: false`) at `/pay`.
6. `PayBrowser` returns via the deep link
   `com.jsrcoaching.app://payment-callback?payment=…&course=…&order=…`
   (`src/config/paymentReturn.ts`); the app then polls `recover-enrollment`.
7. Entitlement is granted **only** by the HMAC-verified `razorpay-webhook`.
   The return params carry no access.

Conclusion: there is **no automatic browser redirect**. A browser appearing
mid-payment means step 4 — on the reported device, an APK older than the
payment plugin (`RazorpayBridgeMissingError`).

## 6. Gate status

typecheck clean · eslint clean on changed files · vitest 778 passed / 6 skipped
· production build OK.

## Still owner-side

1. Install v2026.9.19.1 APK, run a ₹1 purchase — native sheet must open in-app.
2. Rotate `LOVABLE_API_KEY` in Supabase → Edge Functions → Secrets, redeploy
   `chatbot` (503 gateway_unauthorized until then).
3. Playwright E2E: same 5 specs failing since before these fixes — needs live
   E2E account/course IDs.
