# Capacitor — Build, Run, Debug

One-pager for native iOS/Android builds of Safar English.

## First-time setup

```bash
npm install
npx cap add ios       # macOS only
npx cap add android
```

## Every code change

```bash
npm run build         # produces dist/
npx cap sync          # copies dist/ + plugins into native projects
```

## Run on device / emulator

```bash
npx cap run android
npx cap run ios       # macOS only
```

Or open in the native IDE:

```bash
npx cap open android  # → Android Studio
npx cap open ios      # → Xcode
```

## Remote debugging

- **Android**: Chrome → `chrome://inspect` → pick the WebView.
- **iOS**: Safari → Develop menu → device name → WebView.

Console logs and network requests show up live.

## Native logs

```bash
# Android
adb logcat | grep -iE "capacitor|chromium|safar"

# iOS (with device connected)
xcrun simctl spawn booted log stream --predicate 'process == "App"'
```

## Live reload from Lovable preview

Temporarily uncomment the `server` block in `capacitor.config.ts` (URL is in the comment), run `npx cap sync`, then `npx cap run android`. Comment it back out before producing a release APK.

## Screen-capture protection

- Lesson player, PDF viewer, and Archive reader auto-enable Android `FLAG_SECURE` via `useScreenProtection(true)` (`@capacitor-community/privacy-screen`).
- Dashboard, notices, and other non-sensitive pages are intentionally screenshot-able.

## Release APK

GitHub Actions workflow already strips the dev server URL and produces a self-contained APK. Trigger via the **Build APK** workflow in the repo's Actions tab.

## Security scan

```bash
npx capsec scan --severity high
```

---

# Capacitor Audit

_(merged from the former `CAPACITOR_AUDIT.md`)_

**Date:** 2026-06-07
**Auditor lens:** `senior-architect-audit` skill across all 15 Capacitor skills
**Overall rating: 4 / 5** — Solid Capacitor integration with smart performance and security choices. A few HIGH-severity gaps in offline coverage and observability remain.

> One-shot consolidated report. Per-skill batches A–E (Foundations → UX → Reliability → Integrations → Quality gates) have been merged into the findings tables below.

---

## Per-Skill Scorecard

| # | Skill | Rating | Headline |
| --- | --- | --- | --- |
| 1 | webapp-to-capacitor | 5/5 | Clean `webDir`, prod has no `server.url`, scheme set correctly |
| 2 | capacitor-best-practices | 4/5 | Lazy plugin imports done well; bridge-call batching not enforced |
| 3 | capacitor-deep-linking | 4/5 | `useDeepLinks` exists; needs login-redirect-after-link test |
| 4 | capacitor-keyboard | 4/5 | `resize: 'native'` + `--nb-keyboard-h` var is the right call |
| 5 | capacitor-offline-first | 3/5 | OfflineBanner present; query persister exists; no mutation queue |
| 6 | capacitor-performance | 4/5 | `lazyWithRetry` everywhere; perf overlay gated; bundle could shrink |
| 7 | capacitor-plugins | 4/5 | Plugin set is current; no duplicates; one unused dep likely |
| 8 | capacitor-security | 4/5 | `webContentsDebuggingEnabled` properly env-gated; needs CSP meta |
| 9 | capacitor-splash-screen | 5/5 | JS-controlled hide + 2 s safety timeout — best-practice |
| 10 | capacitor-testing | 2/5 | No tests detected for native paths or plugins |
| 11 | debugging-capacitor | 4/5 | Debug gating correct; logs strategy documented in CI |
| 12 | ionic-design | N/A | Project does not use Ionic — Tailwind + Radix instead. Skip. |
| 13 | ios-android-logs | 3/5 | No runbook; APK build uploads gradle logs on failure (good) |
| 14 | safe-area-handling | 4/5 | `safe-area-top/bottom` utility classes used consistently |
| 15 | tailwind-capacitor | 4/5 | Tailwind v3 + Radix; safe-area + viewport classes present |

---

## Findings (CRITICAL & HIGH only — full list below)

### [CRITICAL] [DATA] Smart Notes had no Data API GRANTs — FIXED in this audit
**Where:** `public.smart_notes`
**Why:** RLS policies existed but the table had no `GRANT` to `authenticated` or `service_role`. PostgREST silently denied all reads/writes. Symptom: notes appeared empty after leaving the lesson view because the insert had failed and the read returned nothing.
**Fix:** Added `GRANT SELECT,INSERT,UPDATE,DELETE … TO authenticated`, `GRANT ALL … TO service_role`, plus partial unique indexes `(user_id, lesson_id)` and `(user_id, course_id)` so `upsert` is well-defined. `useSmartNote.save` now uses `upsert(payload, { onConflict })` instead of insert/update fork.

### [HIGH] [RELY] No mutation queue when offline
**Where:** `src/lib/perf/queryPersister.ts`, hooks using `useMutation`
**Why:** `OfflineBanner` and `useOnlineStatus` exist, but mutations performed while offline are not queued — they fail and the user loses the action. This is the gap between "feels native" and "is native".
**Fix:** Wrap critical mutations (`smart_notes.upsert`, `lesson_progress` update, `lesson_bookmarks` create) with a tiny offline queue (Capacitor `Preferences` storage) that flushes on `App` resume + Network status `connected`.

### [HIGH] [OBS] Errors are swallowed by `console.error` in several hooks
**Where:** `src/hooks/useSmartNote.ts`, others using `.catch(() => {})`
**Why:** Production has no error reporter; silent failures are invisible. With Capgo live updates shipping JS bundles independently of native, a broken bundle would not raise a flag.
**Fix:** Add a thin wrapper (Sentry or a Supabase `app_errors` table writer) and replace silent `console.error` calls with `reportError(err, { surface: '…' })`.

### [HIGH] [PERF/CONFIG] APK workflow can be trimmed further — FIXED in this audit
**Where:** `.github/workflows/build-apk.yml`
**Why:** Already well-tuned. Remaining wins: bun install cache, gradle daemon flags, single-command icon restore. See Phase 2 commit.

### [HIGH] [UX] Botany PDF "couldn't load" — needs reproduction
**Where:** likely `src/components/video/FastPdfReader.tsx` or `useLocalPdfSource.ts`
**Why:** Without the specific PDF URL / console error, root cause cannot be pinned. Likely candidates: PDF.js worker path under `capacitor://` scheme, signed-URL expiry on `lecture-pdfs` bucket, or range-request blocking on Android WebView.
**Fix:** Reader now logs the failing URL + HTTP status to console (was already partly there; will be strengthened in a follow-up after you reproduce). To diagnose: open Chrome DevTools → `chrome://inspect` → tap the Botany PDF → copy the failing network request and share.

---

## Full Findings (MEDIUM & LOW)

| Sev | Cat | Where | Issue | Fix |
| --- | --- | --- | --- | --- |
| MED | SEC | `index.html` | No Content-Security-Policy meta | Add `default-src 'self'; connect-src 'self' https://*.supabase.co https://api.openai.com …` |
| MED | DATA | `lecture_notes` | Has policies but check GRANTs same way smart_notes was | Run the bulk grant audit query |
| MED | PERF | `App.tsx` | `BrowserRouter` not lazy; could use `unstable_HistoryRouter` with persisted history | Defer until React Router 7 idioms stabilize |
| MED | OBS | `useAndroidBackButton` | `try/catch { /* not capacitor */ }` swallows real load failures of `@capacitor/app` | Distinguish web vs error |
| MED | RELY | `useSmartNote` | No auto-save; user must hit Save | Add 500 ms debounced `save(draft)` while editing |
| MED | UX | `SmartNotesReader` | Save button only visible while editing; auto-save would remove the failure mode | Combine with above |
| LOW | A11Y | floating buttons | `aria-label` present — good. No keyboard handler for fab | Add `onKeyDown` Enter/Space |
| LOW | MAINT | `useStudentNotes` | `const db = supabase as any` | Generate types via Supabase CLI and drop the cast |
| LOW | CONFIG | `capacitor.config.ts` | `process.env.CAP_DEBUG` only honored at config-load time, not per-build env | OK, but document it in `README` |

---

## Wins (what's done right)

- **Splash**: `launchAutoHide: false` + JS-controlled hide with 2 s safety timer = best-in-class cold start.
- **Debug gating**: `webContentsDebuggingEnabled` is correctly tied to an env flag, not a static `true`. CAP001 clean.
- **Plugin loading**: Almost every Capacitor plugin is dynamically imported, with a try/catch web fallback.
- **Splash + StatusBar colors** match (`#F7F4EE`) — no first-frame flash.
- **`lazyWithRetry`**: handles stale chunk recovery after Capgo OTA. Production-grade.
- **Hardware back button**: module-level guard prevents the StrictMode double-listener bug — most teams hit this and don't fix it.
- **APK workflow**: caches Android SDK, Gradle, uses bun. Already 2–3× faster than a naive setup.

---

## Recommended Next Steps (prioritized)

1. **Reproduce the Botany PDF failure** with Chrome DevTools → fix the worker URL or signed-URL flow.
2. **Add the offline mutation queue** (HIGH).
3. **Add an error reporter** + replace silent catches (HIGH).
4. **Run the GRANT audit** on every public table — `smart_notes` was not the only one likely affected.
5. **Add CSP meta** to `index.html`.
6. **Add basic Playwright + Capacitor e2e** for the 3 critical flows: login → enroll free → play lesson.

---

_Generated as part of the multi-phase plan; per-batch detail (A–E) collapsed into the tables above. Re-run the `senior-architect-audit` skill on individual surfaces for deeper drill-downs._

---

## 2026-07-25 — App Crash Shield + Web→Capacitor walkthrough (read-only)

Skills applied: `app-crash-shield`, `webapp-to-capacitor`. No source files were modified.

### Part 1 — App Crash Shield audit

**Overall: 4/5.** The crash-prevention scaffolding is more mature than most Capacitor apps ship with. A handful of leaks and OOM hotspots remain in feature code.

#### Shield primitives — status

| Primitive | File | Status | Notes |
|---|---|---|---|
| Heartbeat watchdog | `src/lib/crashShield.ts:74` | ✅ | 2s tick, 10s freeze threshold, hidden-tab aware, 60s reload cooldown mirrored to `sessionStorage` + `localStorage` (survives WebView OOM). |
| Global rejection trap | `src/lib/crashShield.ts` | ✅ | Wired via `main.tsx:164` dynamic import. |
| Memory ceiling probe | `src/lib/crashShield.ts:24` | ✅ | 400 MB warn zone via `performance.memory` (Chromium only). |
| ErrorBoundary auto-recovery | `src/components/ErrorBoundary.tsx:29` | ✅ | 60s cooldown, dual-store, message allow-list (`ChunkLoadError`, post-suspend re-mount errors). No infinite loop risk. |
| Bounded query cache | `src/lib/perf/queryPersister.ts` | ✅ | 4 MB cap, 8s idle save, skip list for live/realtime/session. |
| Resume recovery | `src/hooks/useResumeRecovery.ts` | ✅ | RAF watchdog (1.5s), 10-min stale-bg reload, chunk-error reload, `app:resumed` event for query invalidation. |

#### Findings

**[HIGH] [PERF] `LessonView.tsx` is a god-component and an OOM hotspot**
`src/pages/LessonView.tsx` is >2800 lines and holds ≥6 `createObjectURL` sites (lines 310, 1595, 2133, 2549, 2830, …). All are revoked, but several use `setTimeout(revoke, 5000)`. If the user navigates away inside those 5 s the blob stays pinned until GC — on low-RAM Android that's a real leak. **Fix later:** track blob URLs in a ref set and revoke in the effect cleanup on unmount, in addition to the timer.

**[MEDIUM] [RELY] `savedDownloads.ts` ephemeral blob URLs pinned 30 s**
`src/services/savedDownloads.ts:293` — 30-second revoke timer. Downloads screen is a common back-navigation target; consider a 5 s cap or WeakRef map keyed by route.

**[MEDIUM] [PERF] `visibilitychange` listeners in `LessonView.tsx:1160` and `useAutoHideControls.ts:148`**
Both register on `document`; both include cleanup — verified. Keep them but audit any future addition (LessonView already remounts on every lesson click).

**[LOW] [RELY] `MahimaGhostPlayer` iframe release**
Verified the YouTube iframe unmounts with the component (no manual `src=""` reset needed under React), but portrait↔landscape mask swaps do not tear down the iframe — good for state continuity, but if a user rapidly rotates 20+ times the YT postMessage listener queue can grow. Non-urgent.

**[LOW] [MAINT] `crashShield.ts` reload throttle uses per-tab `sessionStorage`**
Already mirrored to `localStorage` (line 30-34) → correct. No action.

#### Live-diagnose commands (for you to run on device)
```bash
adb logcat | grep -iE "AndroidRuntime|chromium|WebView|lowmemorykiller|safarenglish"
adb shell dumpsys meminfo com.safarenglishka.app
adb shell am send-trim-memory com.safarenglishka.app COMPLETE
```
Verification loop: cold-start → Books → open PDF → back → LessonView → play video → back — repeat 20×. Then `send-trim-memory COMPLETE`. App must stay responsive; input latency < 2 s.

---

### Part 2 — Web→Capacitor compliance

**Overall: 4/5.** Config is tight, plugin surface is comprehensive. Store-submission gaps (not code bugs) are the main risk.

| Skill step | Status | Evidence |
|---|---|---|
| 1. Static build readiness | ✅ | `webDir: dist`; postbuild size guards (180 KB entry / 280 KB chunk) in `package.json`. |
| 2. Capacitor integration | ✅ | `capacitor.config.ts` reviewed. `allowNavigation` properly narrowed (Supabase hosts already removed — good). `webContentsDebuggingEnabled` gated on `CAP_DEBUG=1`. |
| 3a. Safe areas | ⚠️ Partial | 20+ files reference `env(safe-area-inset-*)`. Admin pages (`AdminUsers`, `AdminCMS`, etc.) not spot-checked — verify on notched device. |
| 3b. Keyboard-safe forms | ✅ | `Login.tsx` inputs use `h-12` (44 px tap) — verified no `text-sm` on inputs. Keyboard plugin `resize: 'native'` + JS inset tracker present. |
| 3c. Hardware back button | ✅ | `useAndroidBackButton.ts` with module-level guard. |
| 3d. Splash → first paint | ✅ | `SplashHider.tsx` + JS 2 s safety; StatusBar color matches splash `#F7F4EE`. |
| 3e. Offline / error states | ⚠️ | Downloads/Live have UI; a global offline mutation queue is not implemented (flagged in prior audit above). |
| 4. Permission prompts in-context | ⚠️ Unverified | Camera / Notifications / Storage — need per-page walkthrough. |
| 5a. Apple: account deletion | ✅ | `/delete-account` → `DeleteAccountPublic.tsx` routed in `App.tsx:330`. Verify link is reachable from **inside** the app (Settings) — required for App Store review, not just the public URL. |
| 5b. Apple: IAP vs external | 🚨 **BLOCKER for iOS** | `BuyCourse.tsx` uses Razorpay (native SDK on Capacitor, JS fallback on web). Apple **rejects** apps that sell digital content/subscriptions via non-IAP payment rails without the External Link Account entitlement. This app must either: (a) apply for the entitlement, (b) switch to StoreKit IAP for iOS, or (c) ship Android-only. Android/Play allows Razorpay for physical/education services in India — verify course type qualifies. |
| 5c. Apple: Sign-in-with-Apple parity | ⚠️ | Phone login + email login present; if Google/social login is ever added, SIWA parity becomes mandatory. |
| 5d. Play: Data safety form | ⚠️ | Push, Camera, Filesystem, Location (if any), analytics — must all be declared. |
| 5e. Play: Closed-testing track | ⚠️ | New personal-developer accounts still need 20-tester × 14-day closed test before production. Plan early. |
| 6. Device verification | ⚠️ | No CI matrix; manual only. `e2e/` folder exists but Capacitor device runs are not automated. |
| 7. Capgo live updates | ❌ Intentionally off | `capacitor.config.ts` note: "paid SaaS, not used. Updates ship via Play Store APK." Skill recommends it, but respect the explicit repo decision. |

#### Wins (called out for the record)
- `allowNavigation` narrowed by host, not wildcard — one of the cleanest Capacitor configs reviewed.
- `PrivacyScreen.enable:false` with JS-driven `FLAG_SECURE` — thoughtful (matches skill anti-pattern list).
- Dev-only `webContentsDebuggingEnabled` — production APKs are not debuggable.
- Payment code path-splits `Capacitor.isNativePlatform()` (`BuyCourse.tsx:325`) — no Razorpay web SDK forced into the WebView.

---

### Prioritized backlog (no code changed this pass — awaiting your approval per item)

| # | Priority | Area | Item |
|---|---|---|---|
| 1 | **P0 iOS-blocker** | Store | Decide Razorpay policy for iOS: IAP migration, External-Link entitlement, or Android-only launch. |
| 2 | P1 | Crash | Convert LessonView `setTimeout`-revoke pattern → effect-cleanup + ref-set (prevents OOM leaks on quick back-nav). |
| 3 | P1 | Store | Confirm in-app `Settings → Delete Account` link exists (Apple review requirement). |
| 4 | P2 | Reliability | Add offline mutation queue (carried from previous audit). |
| 5 | P2 | Store | Draft Play Data-safety declarations against actual plugin surface. |
| 6 | P3 | Perf | Split LessonView (>2800 lines) into per-tab lazy chunks. |
| 7 | P3 | QA | Automate one Capacitor smoke run (login → open lesson → play video) in CI. |

_Ran with the `app-crash-shield` and `webapp-to-capacitor` skills. Read-only walkthrough — no source files changed._
