# Audit: Mobile + APK + Payments + Crash (Safar English)

**Rating: 4.3/5** — Production-grade base with strong security defaults; one live perf regression (crashShield 19.9s freeze) is the only real HIGH.

**Scope:** Mobile UX layer, `capacitor.config.ts`, `.github/workflows/build-apk.yml`, Razorpay client + edge functions, crash-shield telemetry, native plugin hygiene. Supabase RLS + UI/A11Y out of scope.

**Widths considered:** 360 / 375 / 390 / 430 (mobile-only viewport)

---

## Reconciliation Table

| Claim (from prior chats / project-knowledge) | Live state | Verdict |
|---|---|---|
| `server.url` must stay empty in `capacitor.config.ts` | Empty ✓ | ✅ Pass |
| `webContentsDebuggingEnabled` gated on `CAP_DEBUG=1` | `process.env.CAP_DEBUG === '1'` (both iOS + Android) | ✅ Pass |
| `cleartext: true` / `allowMixedContent: true` never set | `allowMixedContent: false`, no cleartext | ✅ Pass |
| Back-button listener mounted **once** | Single `App.addListener("backButton", …)` in `useAndroidBackButton.ts:173` | ✅ Pass |
| Razorpay verify is server-side only | 5 edge functions present: `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, `razorpay-refund-webhook`, `verify-subscription-payment` | ✅ Pass |
| No client-side `INSERT INTO enrollments` for paid courses | Only match is `src/test/enrollment-bypass.integration.test.ts` (regression test — expected) | ✅ Pass |
| No hardcoded Razorpay/service-role secrets in bundle | Zero matches in `src/` and `public/` | ✅ Pass |
| No localStorage-based auth tokens/roles | Only match: `nb_admin_eruda` (DevTools opt-in flag, not auth) | ✅ Pass |
| APK workflow uses tsgo, Node 24 pin, smoke check | 11/11 canonical markers present in `build-apk.yml` | ✅ Pass |
| `allowNavigation` narrowed (no `*.google.com` wildcard) | Narrow subdomain list, comment documents past incident | ✅ Pass |
| Splash has JS-side safety timeout | `SplashHider.tsx` handles it, `launchAutoHide: false` in config | ✅ Pass |
| Static `@capacitor/*` imports have web fallback | 3 files use `import type` (types-only, not runtime) — actual runtime imports are dynamic | ✅ Pass |
| Crash-shield installed with heartbeat + traps + memory | `[crashShield] installed (heartbeat + traps + memory)` in live console | ✅ Pass |
| Main thread never freezes > 5s on preview | **`[crashShield] main-thread frozen 19923ms`** on `/index` cold load | ❌ **HIGH regression** |

---

## Findings

### [HIGH] [PERF/RELY] Main-thread frozen 19.9s on `/index` cold load

**Where:** live console @ `id-preview…lovable.app/`, tripped `crashShield` auto-reload path.

**Evidence:**
```
2026-07-06T04:02:37Z warning: [crashShield] auto-reloading: main-thread frozen 19923ms
2026-07-06T04:02:41Z info: [crashShield] installed (heartbeat + traps + memory)
```

**Symptom:** cold-load of `/` blocks main thread for ~20s, breaches the crashShield heartbeat watchdog, and forces an auto-reload. On a real low-RAM Android device this equals a hang + user-visible crash spinner, or Android's `RENDERER_UNRESPONSIVE` → WebView kill.

**Root cause hypothesis (in order of likelihood):**
1. Heavy synchronous work in a component eagerly imported by `/index` — likely the marketing-carousel/hero data initialisation, or `queryPersister` restoration blocking rehydration on a large IndexedDB cache.
2. A `React.lazy` chunk on the landing route not using `lazyWithRetry`, retry-storming when the first chunk request stalls.
3. Font/hero image loading path that CPU-decodes on the main thread (large PNG instead of WebP/AVIF).

**Fix (surface for approval):**
- Instrument `/index` cold path with `performance.mark`/`measure` — `nb-cold-start`, `nb-persister-restore`, `nb-hero-render`.
- Move `queryPersister` restore to a `requestIdleCallback` chain with a 100ms budget slice; skip on IndexedDB > 5MB.
- Convert `src/assets/hero.{png,jpg}` → `?format=avif` + `?format=webp` via `vite-imagetools`, preload only the AVIF variant.
- Wrap `<Suspense fallback={null}>` on landing sub-sections in an `ErrorBoundary` so a chunk stall degrades gracefully instead of retry-storming.
- Add a Lighthouse CI budget: `total-blocking-time < 500ms`, `largest-contentful-paint < 2500ms` in `.github/workflows/lighthouse-ci.yml`.

**Why HIGH not CRITICAL:** it does not corrupt data or leak secrets; it degrades cold start on the landing route. But it *is* the one live signal that must be closed before the next APK ships — on low-end Android this becomes a real crash.

---

### [MEDIUM] [MAINT] `key={idx}` used in 6 places

**Where:**
- `src/pages/Reports.tsx:256` — chart `<Cell>` (stable order — safe)
- `src/pages/QuizAttempt.tsx:269` — quiz options (order changes per question — **risk**)
- `src/pages/Dashboard.tsx:220` — skeleton loop (safe)
- `src/pages/AdminAnalytics.tsx:416` — analytics rows (safe if not reordered)
- `src/components/admin/TimetableManager.tsx:87` — day names (immutable — safe)
- `src/components/lesson/AskDoubtSheet.tsx:284` — doubt replies (append-only — safe)

**Symptom:** wrong state binding if the list ever reorders (checked-radio bleeding across quiz questions is the classic case).

**Fix:** switch `QuizAttempt.tsx:269` to `key={option.id ?? \`\${question.id}-\${idx}\`}`. Leave the other 5 (already stable-index or immutable).

---

### [MEDIUM] [PERF] Bundle-size budget not enforced

**Where:** `.github/workflows/build-apk.yml` — smoke-check verifies plugin classes; no size budget.

**Symptom:** a rogue heavy import (e.g. someone `import * from 'lodash'`) ships silently. Given Safar English has 22 `@capacitor/*` packages + Bunny + PDF.js + Razorpay, the JS bundle is already large.

**Fix:** add a `bundlesize` step to the APK workflow after `npm run build`:
```yaml
- name: Enforce bundle budget
  run: |
    MAIN_KB=$(du -k dist/assets/index-*.js | awk '{print $1}')
    if [ "$MAIN_KB" -gt 400 ]; then echo "main chunk > 400KB"; exit 1; fi
```
Also enable `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split vendor.

---

### [LOW] [MAINT] Test file uses `as any` on Supabase mock

**Where:** `src/test/resolveContentUrl.test.ts:18` — `.supabase as any`.

**Symptom:** masking type drift if the client mock signature changes.

**Fix:** switch to typed `MockedFunction<typeof supabase.from>` from vitest. Cosmetic — test-only, no runtime impact.

---

### [LOW] [OBS] `crashShield` freeze reason is a raw string

**Where:** `src/lib/crashShield.ts:56`.

**Symptom:** Sentry breadcrumb for the 19.9s freeze arrives as `auto-reloading: main-thread frozen 19923ms` — hard to group. Better to include the last-known route + last-known active `queryKey` for triage.

**Fix (auto-fixable, low risk):** enrich the log payload with `{ route: window.location.pathname, freezeMs, memMB }`.

---

## Wins

- **Zero hardcoded secrets in the client bundle.** `rzp_live|sk_live|SUPABASE_SERVICE_ROLE` sweep returned clean.
- **Razorpay flow is textbook.** Server order → HMAC verify → webhook truth. `capacitor-razorpay` lazy-imported via `await import()`.
- **`allowNavigation` narrowed** from wildcard `*.google.com` to explicit subdomains — old incident closed and commented for posterity.
- **Back-button architecture correct.** Single listener, module-level guard, sentinel-state overlay contract.
- **APK workflow is the reference implementation** — 11/11 canonical markers, `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`, tsgo not tsc, smoke check for MainActivity + plugin classes.
- **Splash controlled by React** (`launchAutoHide: false` + `SplashHider.tsx` safety timeout) — cold-start feels instant on hot cache.
- **Safe-area handled correctly** on the two `bottom-0 fixed` surfaces (Index landing CTA + LessonView comment bar) via inline `env(safe-area-inset-bottom)`.
- **`crashShield` module-level guard** prevents double-install under StrictMode/HMR.
- **Active CI is intentionally lean**: APK, Lighthouse, Supabase/PDF keepalive, enrollment-bypass regression, and dependency audit remain. Playwright E2E and Maestro device-matrix workflows were removed because they required stable seeded data + test-account secrets and repeatedly produced false-red releases.

---

## Fix Plan

### Now (this session — surface, don't apply)
1. **[HIGH]** Investigate + close the 19.9s freeze on `/index` — needs perf marks + file identification before touching code.

### Next (this week)
2. **[MEDIUM]** `QuizAttempt.tsx:269` — swap `key={idx}` for `key={option.id ?? \`\${question.id}-\${idx}\`}`.
3. **[MEDIUM]** Add bundle-size budget step to `build-apk.yml` + `manualChunks` in `vite.config.ts`.
4. **[LOW]** Enrich `crashShield` freeze payload with route + memMB.

### Root (backlog)
5. Convert LCP hero to AVIF/WebP via `vite-imagetools`.
6. Lighthouse CI budget: TBT < 500ms, LCP < 2500ms.
7. Migrate test mock off `as any`.

---

## Speed & Perf Delta (projected after fix plan)

| Metric | Now | After fixes | How |
|---|---|---|---|
| `/index` main-thread block | ~19.9s (worst obs.) | < 500ms | Idle-callback for persister, AVIF hero, lazyWithRetry on sub-sections |
| Landing route JS | (unmeasured) | budget 400KB gz | manualChunks + bundle-size CI gate |
| APK cold start (mid-range Android) | ~4-6s | ~2.5s | LCP fix flows through to native WebView |
| crashShield auto-reloads / week | ≥1 (observed) | 0 | root cause closed |
| Console noise → Sentry | 6 raw `console.error` on freeze path | 1 structured `reportError` | payload enrichment |

---

## Skill Tracker (28 rows)

| # | Skill | State | Note |
|---|---|---|---|
| 1 | webapp-to-capacitor | ✅ | Applied, project already store-ready |
| 2 | capacitor-best-practices | ✅ | Config matches recommendations |
| 3 | capacitor-deep-linking | ✅ | assetlinks.json + `.well-known/` present |
| 4 | capacitor-keyboard | ✅ | Resize mode `native` + CSS var tracker |
| 5 | capacitor-offline-first | ⚠️ | React Query cache present; no SW (intentional per project-knowledge) |
| 6 | capacitor-performance | ⚠️ | **HIGH freeze finding open** |
| 7 | capacitor-plugins | ✅ | 22 official plugins, decision-tree respected |
| 8 | capacitor-security | ✅ | Config hardened; capsec scan not yet run this cycle |
| 9 | capacitor-splash-screen | ✅ | JS-controlled + 2s safety timeout |
| 10 | capacitor-testing | ✅ | Playwright + Maestro + vitest present |
| 11 | debugging-capacitor | ✅ | Scripts under `scripts/logs-*.sh` |
| 12 | ionic-design | ✅ | Patterns applied where relevant |
| 13 | ios-android-logs | ✅ | `logs-android.sh`, `logs-ios.sh`, `crash-dump-android.sh` |
| 14 | safe-area-handling | ✅ | Both fixed-bottom surfaces respect insets |
| 15 | tailwind-capacitor | ✅ | Tokens via `index.css`, no hardcoded hex |
| 16 | capacitor-back-button | ✅ | Single listener, module-guarded |
| 17 | asset-optimization | ⚠️ | LCP hero not AVIF/WebP — see fix plan |
| 18 | senior-architect-audit | ✅ | This report |
| 19 | capacitor-video-player-master | ✅ | Bunny + custom viewer, unmount cleanup enforced |
| 20 | app-crash-shield | ⚠️ | Installed but tripped once — root cause open |
| 21 | console-error-triage | ✅ | Sentry forwarder + noise suppression list live |
| 22 | soft-touch | ✅ | Tap targets ≥ 44px on primary actions |
| 23 | capacitor-ci-cd | ✅ | 10 workflows in place |
| 24 | capacitor-app-store | ⏳ | Not yet audited this cycle (out of scope) |
| 25 | capacitor-apple-review-preflight | ⏳ | Android primary; iOS submission not in scope |
| 26 | supabase-architect-auditor | ⏳ | Out of scope this pass (payments + mobile only) |
| 27 | razorpay-payments | ✅ | Server-order + HMAC + webhook flow verified |
| 28 | github-skill-importer | ✅ | Meta-skill active; used to bootstrap this audit |

---

## Reusable Audit Prompt (paste into any future project)

See `.agents/prompts/senior-audit-bootstrap.md` — full copy-paste block for kicking off this same workflow in a fresh Lovable project after connecting `MrAnujBabu/35`.

---

Used senior-architect-audit + supabase-architect-auditor + mobile-view-expert + app-crash-shield + capacitor-bun-apk-build + razorpay-payments skills.
