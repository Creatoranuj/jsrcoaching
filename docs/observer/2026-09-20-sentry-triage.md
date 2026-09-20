# Sentry triage — 2026-09-20

Org `safar-english` · project `app` · window 14d · env production.
Source: live Sentry query (`is:unresolved`, sorted by frequency), not an export.

## 1. Unresolved issues at triage time

| Sentry ID | Type | Message | Events | Root cause | Sev | Cat | Fix owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SAFAR-ENGLISH-APP-W | ResponseException | `Unexpected server response (403) while retrieving PDF` (pdf-proxy, course 30) | 1 | Not a defect — `pdf-proxy` returns 403 when the viewer has no active enrollment. The entitlement gate firing correctly | P3 | OBS | `src/lib/sentry.ts` (`HANDLED_NOISE_RE`) — already filtered, commit 4e34bfc |

Every other issue from the 2026-09-19 triage (APP-13/14 Razorpay bridge,
APP-18 LessonView TDZ, APP-15/16/17 recover-enrollment, APP-19 chatbot key)
is out of the unresolved list.

**Action taken:** APP-W resolved in Sentry with a comment recording that the
403 is the enrollment gate and that pdf.js 403/404 is dropped in `beforeSend`
(`src/test/sentryNoise.test.ts` guards it). 5xx `pdf-proxy` failures still
report — those are real outages.

## 2. Breadcrumb-only warnings

None outstanding. The recover-enrollment triple-report and the chatbot
gateway failure were fixed in the previous cycle; neither has produced a new
event in this window.

## 3. Fix plan shipped this cycle (browser payment dead end)

No Sentry issue covers it — it is silent abandonment, not an exception — but
it is the highest-value defect left on the payment path.

### P1 — the way back from browser checkout was fragile
`src/pages/PayBrowser.tsx:48` previously did a single
`window.location.href = "com.jsrcoaching.app://payment-callback?…"`. Chrome
blocks gesture-less custom-scheme navigation, so a paid student could be left
on a browser tab with money debited.

Now a three-hop chain, each hop skipped once the tab goes hidden:
1. custom scheme, 2. `intent://…;package=…;S.browser_fallback_url=…;end`,
3. the verified https App Link (`buildPaymentReturnWebUrl`).
Helpers live in `src/config/paymentReturn.ts`; `src/test/paymentReturnHandoff.test.ts`
(7 tests) asserts all three hops carry the same status/course/order and that
`toInternalPath()` routes the https hop back into the app.

### P1 — no visible way back
`PayBrowser` now renders a full-width "App me wapas jayein" button in the
`done` phase (it already had one for `cancelled`/`error`), plus a "paisa
surakshit hai" line and the order reference for support.

### P1 — old APKs were pushed into a browser
`src/pages/BuyCourse.tsx` `RazorpayBridgeMissingError` branch: the toast now
says update from the Play Store first, and the escape hatch leads with
**"Website par login karke pay karein"** → `https://jsrcoaching.vercel.app/buy-course?id=<id>`
in the system browser, where the student signs into their own account and
pays normally. The bare `/pay` tab is demoted to a small secondary link.

### P2 — return landing behind the login gate
`/payment-callback` stays protected, but `ProtectedRoute` now waits for the
session (`sessionSettled` + `hasStoredSupabaseSession()`) and preserves
`pathname + search` through login, so returning students keep their params.

## 4. Crash-shield pass on the payment path (app-crash-shield skill)

| Check | Result |
| --- | --- |
| Watchdog timers | `src/utils/razorpayNative.ts:126/429` — every `setTimeout` has a matching `clearTimeout` on both resolve and reject paths |
| Post-purchase redirect timer | `BuyCourse.tsx:217` clears it in the unmount effect |
| New hand-off timers | `PayBrowser` tracks them in a ref and clears them on unmount — no stray navigation into a reused tab |
| Retry loop | `nativeRetryRef.current < 1` and `RazorpayBridgeMissingError` excluded — retry can fire at most once and never for a missing plugin |
| Double charge | `RazorpaySheetUnresponsiveError` deliberately has no web fallback |
| Listener leaks | No `addEventListener` on the payment path without cleanup |

## 5. Wins

- Sentry volume down from 8 unresolved issues to 0.
- Payment noise is gone entirely: the 120-event bridge error has not recurred
  since the loader fix.
- Entitlement remains webhook-only; nothing in the browser path can grant a
  course.
- Noise filtering is tested rather than configured by hand in the Sentry UI.

## 6. Open questions

1. Bump the force-update floor so phones without the payment plugin are made
   to update instead of relying on the in-app message?
2. `LOVABLE_API_KEY` rotation + `chatbot` redeploy is still owner-side.
3. The five Playwright end-to-end failures need live test account/course IDs.
