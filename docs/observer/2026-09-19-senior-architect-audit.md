# Audit: In-app payment → enrollment → lesson-view path (Android Capacitor + web)

Scope: `BuyCourse.tsx`, `PayBrowser.tsx`, `MyCourses.tsx`, `LessonView.tsx`, `ChatWidget.tsx`, `src/lib/native/*`, `useEnrollmentRecovery/Arrival`, edge fns `recover-enrollment`, `chatbot`, `pdf-proxy`, `CrashShield` / `crashShield.ts` / `ErrorBoundary`. Baseline commit `8ed3d21`, audited-and-fixed at `3ed6408` (release `v2026.9.19.1`).

**Rating: 4/5** — engineering is now solid (no CRITICAL, no HIGH left open in code); design follows the token system with intent. Held back from 5 by one owner-side config fault (chatbot key) and the bandwidth items that need a dashboard baseline before touching.

## Findings

### [CRITICAL → fixed] [RELY] Native Razorpay bridge never opened
**Where:** `src/lib/native/razorpay.ts` (loader), callers `src/utils/razorpayNative.ts`, `src/utils/upiApps.ts`
**Why it matters:** `async loadRazorpayNative()` resolved the *bare* `registerPlugin()` proxy. Promise resolution reads `.then` on the value; Capacitor's proxy turns every property read into a native call → `"RazorpayNative.then()" is not implemented` (120 events). The in-app sheet could never open; every buyer was pushed to the browser fallback — the exact "browser me redirect ho raha hai" complaint.
**Fix:** loader returns `{ plugin }`; callers destructure. `src/test/nativeLoadersThenSafe.test.ts` mocks `registerPlugin` as a property-recording proxy and asserts no loader leaks a bare proxy.

### [CRITICAL → fixed] [MAINT] TDZ crash in LessonView / AdminQuizManager
**Where:** `src/pages/LessonView.tsx` (`handleVideoTimeUpdate` deps), `src/pages/AdminQuizManager.tsx`
**Why it matters:** `const` from a hook was referenced (in a `useCallback` deps array) above its declaration in the same function. Dev never threw; the minified chunk did (`Cannot access 'Er' before initialization`) → white screen on `/classes/34/lessons`.
**Fix:** reordered; `@typescript-eslint/no-use-before-define` (same-scope, `variables:false`) promoted to `error`; `src/test/tdzLintGuard.test.ts` lints the five risky pages.

### [HIGH → owner action] [CONFIG] Chatbot AI gateway 401
**Where:** `supabase/functions/chatbot/index.ts` `isGatewayAuthFailure()` → 503 `gateway_unauthorized`
**Why it matters:** the project moved Lovable workspaces on 2026-09-19; the `LOVABLE_API_KEY` in the edge-function secrets is the *old* workspace key. Every student chat fails until the secret is rotated. Client dedupe shipped (one Sentry report per failure class per page-load), server fix is a secret update, not code.
**Fix:** Supabase → Edge Functions → Secrets → set `LOVABLE_API_KEY` to the new workspace key → redeploy `chatbot`.

### [HIGH → fixed] [OBS] Triple-reporting of recover-enrollment
**Where:** `useEnrollmentRecovery.ts`, `useEnrollmentArrival.ts`, `src/lib/sentry.ts` console forwarder
**Why it matters:** one failed recovery produced three Sentry issues (generic, `[error]`-mirror, `{"courseId":34}`), none grouped by cause. Auth-expired and offline were counted as bugs.
**Fix:** `recoverEnrollmentDetailed()` → `{ outcome, status, code, reason }`; auth/offline → breadcrumb; server → single `EnrollmentRecoveryError("recover-enrollment <status> <code>")`; forwarder skips `logger.error` mirrors; `logger.error()` auto-promotes a plain object in the error slot to context.

### [MEDIUM → fixed] [UX] "Recover" button gave the same toast for every cause
**Where:** `src/pages/MyCourses.tsx` `handleManualRecover`
**Fix:** auth → "Dobara login karein, phir Recover dabayein — payment safe hai"; offline → "Wi-Fi ya mobile data on karke dobara try karein"; `AMOUNT_MISMATCH` → "Support ko WhatsApp par payment screenshot bhejein"; else generic.

### [MEDIUM → fixed] [UX] PDF 403 copy blamed the CDN
**Where:** `src/lib/pdfErrorMessage.ts`, `src/components/video/FastPdfReader.tsx onLoadError`
**Fix:** 403 through `/functions/v1/pdf-proxy` → "Yeh PDF sirf enrolled students ke liye hai…"; 403/404 no longer captured as exceptions (matches byte-fallback path).

### [MEDIUM] [PERF] `user_sessions` heartbeat is the top egress driver
**Where:** `src/lib/native/sessionTracker.ts` `HEARTBEAT_MS = 5 * 60_000` (PATCH per open tab)
**Why it matters:** earlier slow-query read ranked `user_sessions` select/insert/update #1–#3 by total time. 5 min is already sane; the cost is the *number of tabs × sessions*, not cadence.
**Fix (backlog, needs Egress-report baseline first — bandwidth-maintainer guardrail):** flush on `visibilitychange:hidden` + `pagehide` with `keepalive`, keep the 5-min timer only while visible; add `select("id")` to the pre-update existence check.

### [MEDIUM] [PERF] `site_settings` read by four hooks with separate keys
**Where:** `useMenuFeatureFlags.ts`, `usePlayerReaderControls.ts` (×2), `useLessonFeatureFlags.ts` (×2)
**Why it matters:** each has `staleTime` 5 min (good) but distinct query keys → 4–5 round trips per cold load for one 2-column table.
**Fix (backlog):** one `useSiteSettings()` query keyed `["site_settings"]`, selectors per feature. Est. −80% requests on that table; row size unchanged.

### [LOW] [A11Y] Diagnostics panel uses `text-[10px]`/`text-[11px]`
**Where:** `src/pages/BuyCourse.tsx` payment diagnostics block (admin/test only)
**Reference:** Linear's debug drawers bottom out at 12px (`text-xs`) for legibility on 360-px Androids.
**Fix:** `text-xs` for both; keep `font-mono` for the `<pre>`.

### [LOW] [VIS] Browser-escape button competes visually with the primary CTA
**Where:** `BuyCourse.tsx` — `variant="outline"` full-width directly under the filled Pay button
**Reference:** Stripe Checkout / Razorpay's own "Pay with other method" is a ghost text link, not a second full-width outlined button.
**Fix:** `variant="link"` `text-sm text-foreground/70 underline-offset-4` centred; retain `min-h-11` tap target.

### [LOW] [OBS] Eruda fetch-wrapper noise
**Where:** admin sessions only
**Fix:** `beforeSend`: drop events whose top frame filename contains `eruda`.

### Category sweep
| Cat | Result |
|---|---|
| SEC | N/A — no change to auth or RLS this pass; `pdf-proxy` enrollment gate verified present (`authorizeUrl`). |
| AUTHZ | ✓ `recover-enrollment` requires bearer (401), server-verified Razorpay capture before enrollment insert. |
| DATA | ✓ `AMOUNT_MISMATCH` refuses to enroll on amount drift; rate limit 5/60 s via `check_rate_limit`. Open Q: per-user vs per-device key. |
| PERF | 2 MEDIUM above (backlog, baseline first). |
| RELY | ✓ post-fix. Crash shield: 1 auto-reload / 60 s (`nb_crash_reload_at`), ErrorBoundary 1 / 60 s (`nb_eb_auto_reload_at`), stale-chunk reload once per session (`lovable:chunk-reload`), never while offline. `setInterval` 23 / `clearInterval` 27 — no orphan timers found. LessonView `addEventListener` 4 / `removeEventListener` 4. |
| UX | ✓ post-fix. |
| A11Y | 1 LOW. Inputs are `text-base` on mobile (`ChatWidget` 860); tap targets ≥ 44 px (`h-12`, `min-h-11`). |
| OBS | ✓ post-fix; 1 LOW. |
| MAINT | ✓ lint gate + two static guard tests added; `madge` reports no cycles. |
| CONFIG | 1 HIGH (owner). |
| VIS | 1 LOW. Tokens respected: zero hard-coded colours in the four screens, no arbitrary `duration-[..]`/`rounded-[..]`, `hoverOnlyWhenSupported` set globally (no sticky hover in the WebView). |
| MOT | ✓ press state `active:scale-[0.97] duration-150 ease-out` on Pay + escape; haptics `tapLight` (primary) / `tapMedium` (escape) / `tapHaptic`,`selectionHaptic` (My Courses); `prefers-reduced-motion` handled in `index.css`. |

## Wins
- The native-loader convention (`{ plugin }` container) existed in five files; the fix was to make the sixth conform and add a test that makes drift impossible.
- Payment fallback was already opt-in, not automatic — the "browser redirect" was a symptom of the proxy bug, not a design choice.
- Crash shield, error boundary and chunk-reload share one philosophy: bounded retries in `sessionStorage`, never reload offline.
- Design tokens are actually used: no raw hex, no `text-white`, correct type sizes on inputs, haptics on primary and destructive actions.

## Fix plan
1. **Now (owner):** rotate `LOVABLE_API_KEY` in Supabase edge-function secrets; redeploy `chatbot`. Install `v2026.9.19.1` APK on a phone; ₹1 test purchase; confirm the Razorpay sheet opens *inside* the app; open a lesson and a PDF.
2. **This PR (shipped):** all CRITICAL/HIGH code items, both MEDIUM UX items.
3. **Next PR (after Egress baseline):** `useSiteSettings()` consolidation; visibility-driven `user_sessions` flush.
4. **Backlog:** `text-xs` diagnostics; escape-hatch as link variant; Eruda `beforeSend` filter.

## Open questions
- Is `app_config.min_android_version` bumped so pre-plugin APKs are force-updated, or should `RazorpayBridgeMissingError` keep steering to the store?
- Should `recover-enrollment`'s rate limit be per user (current) or per user+device?

Used the senior-architect-audit skill.
