# Safar English — App Store Readiness Roadmap

> **Phase 3 update (2026-05-21)** — Auth tokens are now Keystore/Keychain-
> backed on native via `@capacitor/preferences` (see `src/lib/nativeStorage.ts`).
> An offline SQLite mirror scaffold is in place (`src/lib/offlineMirror.ts`).
> 13 internal `SECURITY DEFINER` helpers had `EXECUTE` revoked from
> `anon`/`authenticated`/`PUBLIC` — see migration `20260521-tighten-definer`.
>
> **AndroidManifest permissions audit (verified clean):**
> | Permission | Declared | Reason |
> |---|---|---|
> | `android.permission.INTERNET` | ✅ | Required for HTTPS API calls |
> | UPI `<queries>` (PhonePe/GPay/Paytm/UPI scheme) | ✅ | Razorpay native checkout deep-links |
> | `READ_EXTERNAL_STORAGE` | ❌ Not declared | Not needed — Filesystem plugin writes to app-private dir only |
> | `CAMERA` / `RECORD_AUDIO` | ❌ Not declared | Not used |
> | `ACCESS_FINE_LOCATION` | ❌ Not declared | Not used |
> | `POST_NOTIFICATIONS` | ❌ Not declared | Deferred until push is enabled |
> | `READ_CONTACTS` | ❌ Not declared | Not used |
>
> Hardening flags in `AndroidManifest.xml`: `allowBackup=false`,
> `dataExtractionRules` set, `usesCleartextTraffic=false`,
> `networkSecurityConfig` set, `webContentsDebuggingEnabled=false`. ✅
>
> **Play Data Safety summary** (paste into the console form):
> - Data collected: email, full name, mobile (optional), payment receipts.
> - Data shared with third parties: Razorpay (payments), Bunny CDN (video streaming), Supabase (backend).
> - Encryption in transit: Yes (HTTPS only).
> - User can request data deletion: Yes (`/account/delete` public route).

> Senior architect review of the Capacitor (Vite + React Router) app.
> Read-only audit performed on the current `main` snapshot. No source/UI
> changes were made while producing this document.
>
> Generated using the **webapp-to-capacitor** skill.

---

## 0. TL;DR

| # | Item | Severity | Effort | Blocks |
|---|------|----------|--------|--------|
| 1 | In-app **account deletion** flow is a stub ("contact support" toast) | 🔴 Blocker | 0.5d | Play + Apple |
| 2 | **Razorpay** used for digital course purchases on mobile | 🔴 Blocker (iOS), 🟠 High (Android) | 1–3 wk | Apple, possibly Play |
| 3 | iOS platform not added yet (`ios/` missing) | 🟠 High | 1d | Apple |
| 4 | No **safe-area** padding / `viewport-fit=cover` | 🟠 High | 0.5d | Polish/rejection risk |
| 5 | Offline support = static-shell SW only; no course/quiz cache | 🟡 Medium | 1–2 wk | Quality bar |
| 6 | Native **permissions** under-declared vs claimed (no location, no camera, no notifications in AndroidManifest) | 🟡 Medium | 0.5d | Data Safety form |
| 7 | No `@capacitor/status-bar`, `keyboard`, `haptics`, `network` plugins | 🟡 Medium | 1d | Polish |
| 8 | No privacy policy page wired to app + listing | 🟠 High | 0.5d | Play + Apple |
| 9 | Closed-testing track not set up (Play personal-dev rule) | 🟠 High | 14 days wallclock | Play production |
| 10 | Service worker active inside Capacitor WebView | 🟡 Medium | 0.25d | Stability |

If you only do four things this month: **(1) account deletion**, **(2) decide payments strategy**, **(4) safe areas**, **(8) privacy policy + Data Safety**.

---

## 1. Current State (verified from repo)

**Capacitor**: v8, Android only. iOS folder is **not** present.
**Installed plugins**:
- `@capacitor/app` 8.1.0
- `@capacitor/filesystem` 8.1.2
- `@capacitor/splash-screen` 8.0.1
- `@capgo/capacitor-updater` 8.46.1 (OTA via GitHub Releases)

**Android `AndroidManifest.xml`** declares only:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```
No `ACCESS_FINE_LOCATION`, no `CAMERA`, no `POST_NOTIFICATIONS`, no
`READ_MEDIA_*`. The user's claim of "location permissions already added"
is **not reflected in the manifest** — flag this.

**What's already good**:
- Hardware back button: `useAndroidBackButton.ts` is route-aware, has
  parent-fallback rules, double-tap-to-exit, and respects a navigation
  history stack. Best-in-class for a hybrid app.
- Deep links: `useDeepLinks.ts` + intent filters for
  `https://safarenglishka.vercel.app/*` and the custom `com.safarenglishka.app`
  scheme. `assetlinks.json` is published.
- HTML5 video fullscreen → Android immersive mode via
  `BridgeFullscreenWebChromeClient` + `MainActivity.enterImmersive()`.
- Splash hand-off via `SplashHider` with a 4 s safety timeout.
- `network_security_config.xml` enforces TLS, blocks cleartext.
- `data_extraction_rules.xml` blocks adb/cloud backups.
- OTA: `@capgo/capacitor-updater` plus a CI workflow at
  `.github/workflows/capgo-live-update.yml`.

**What's missing or weak**:
- `Settings.handleDeleteAccount` is a stub.
- No safe-area handling, no `viewport-fit=cover`.
- Only `public/sw.js` static-shell cache; no `@capacitor/preferences`,
  no SQLite, no outbox.
- Payments through Razorpay everywhere (web checkout +
  `verify-razorpay-payment` / `razorpay-webhook` edge functions).
- No `@capacitor/status-bar`, `keyboard`, `haptics`, `network`,
  `push-notifications`, `camera`, `geolocation`.

---

## 2. Thin-Wrapper Risk Audit

Both Apple (Guideline 4.2) and Google ("webview spam" policy) reject apps
that feel like a website in a frame. The bar isn't "uses a WebView" — it's
"feels native when used on a phone".

### 2.1 Native page transitions
Currently routes change with a hard React re-render. Recommendation:
- Wrap `Routes` with Framer Motion `AnimatePresence` + per-route
  `motion.div` (`x` slide on iOS, `opacity` fade-through on Android).
- Detect platform via `Capacitor.getPlatform()` and switch the variant.
- Avoid Ionic's `IonRouterOutlet` here — it would force a large refactor.

### 2.2 Safe area handling
`index.html` viewport currently lacks `viewport-fit=cover`. Without it,
`env(safe-area-inset-*)` returns `0` on notched devices.

Action plan:
1. Add `viewport-fit=cover` to the viewport meta.
2. Expose CSS custom properties in `index.css`:
   ```css
   :root {
     --sat: env(safe-area-inset-top);
     --sab: env(safe-area-inset-bottom);
     --sal: env(safe-area-inset-left);
     --sar: env(safe-area-inset-right);
   }
   ```
3. Audit and update:
   - `components/Layout/Header.tsx` → `padding-top: max(12px, var(--sat))`
   - `components/Layout/BottomNav.tsx` → `padding-bottom: var(--sab)`
   - All full-screen modals, `LivePlayer`, `BunnyStreamPlayer`,
     `PdfViewer`, `QuizAttempt`, video overlays.
4. On Android 15 edge-to-edge becomes mandatory; same tokens cover it.

### 2.3 Touch feedback
- Install `@capacitor/haptics`. Trigger `Haptics.impact({ style: Light })`
  on primary CTAs (Buy, Submit Quiz, Mark Attendance, Raise Hand).
- Replace hover-only affordances with `active:` Tailwind states.
- Add Android-style ripple on `Button` via a `:active` overlay or
  `react-tap-highlight` substitute.

### 2.4 Status bar
Install `@capacitor/status-bar`. On route change set:
- Landing/auth → light content over primary color.
- Dashboard/content → dark content over background.

### 2.5 Keyboard
Install `@capacitor/keyboard` with `resize: 'body'` and a listener that
adds bottom padding while the keyboard is open. Forms most affected:
`Login`, `Signup`, `ForgotPassword`, `ResetPassword`, `Doubts`,
`Messages`, `NoteEditor`.

### 2.6 Loading, empty, offline states
Replace generic spinners with skeletons (you already have
`ViewSkeletons.tsx` — extend its pattern to `Dashboard`, `MyCourses`,
`Attendance`, `Notices`, `Materials`, `Timetable`, `Books`).

### 2.7 Global offline banner
Wire `@capacitor/network` (or `window.navigator.onLine` fallback) →
shadcn `Alert` pinned below `Header` when offline.

### 2.8 Service worker inside Capacitor
`public/sw.js` is registered on web. Inside the APK the SW is fragile
(WebView versions vary; Capgo OTA bundle swaps break SW caches).
Recommendation: in `main.tsx`, skip SW registration when
`Capacitor.isNativePlatform()` is true. Keep SW for the PWA/Vercel build.

---

## 3. Permissions Review

### 3.1 Currently declared
| File | Declared |
|---|---|
| `android/app/src/main/AndroidManifest.xml` | `INTERNET` only |
| iOS `Info.plist` | n/a (no iOS project yet) |

### 3.2 Gap matrix — what to add per real feature
| App capability (in code today) | Plugin | Android permission | iOS `Info.plist` key |
|---|---|---|---|
| PDF / notes download → device storage | `@capacitor/filesystem` ✅ installed | None on A11+ (scoped storage); `WRITE_EXTERNAL_STORAGE` only if targeting ≤A10 | — |
| Avatar upload (`AvatarUploadModal`) | `@capacitor/camera` | `CAMERA`, `READ_MEDIA_IMAGES` (A13+) | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` |
| Live class push notifications | `@capacitor/push-notifications` + FCM | `POST_NOTIFICATIONS` (A13+) | APNs entitlement, `aps-environment` |
| Attendance geofencing (if planned) | `@capacitor/geolocation` | `ACCESS_FINE_LOCATION` | `NSLocationWhenInUseUsageDescription` |
| Biometric login (optional, recommended) | `@capgo/capacitor-native-biometric` | `USE_BIOMETRIC` | `NSFaceIDUsageDescription` |
| Network status banner | `@capacitor/network` | `ACCESS_NETWORK_STATE` | — |

### 3.3 Rules
- Request **in context** (right before the feature runs), never on launch.
- Always handle `denied`, `prompt-with-rationale`, `limited`, and
  simulator-unavailable states.
- Provide a "Why we need this" sheet on first prompt.
- Mirror every declared permission in the Play Console *Data Safety* form
  and the Apple *App Privacy* labels.

### 3.4 What NOT to declare
Do not add `ACCESS_BACKGROUND_LOCATION`, `READ_CONTACTS`, `SMS`,
`MANAGE_EXTERNAL_STORAGE`, `QUERY_ALL_PACKAGES` — each one triggers extra
Play review and is unneeded here.

---

## 4. Offline Support Plan

The app is course-based — students study on trains and in low-signal
classrooms. Plan offline in three tiers.

### Tier 1 — Metadata (`@capacitor/preferences`)
Small key/value pairs, instant access, encrypted at rest by the OS.

Use for:
- Auth tokens / refresh tokens (move out of `localStorage` on native)
- Last-viewed course/lesson, "continue learning" pointer
- User preferences, theme, batch selection
- Feature flags fetched at boot

### Tier 2 — Relational cache (`@capacitor-community/sqlite`)
Encrypted SQLite mirror of read-mostly Supabase tables.

Mirror these tables:
- `courses`, `chapters`, `lessons`, `lesson_pdfs`
- `enrollments`, `user_progress`
- `quiz_attempts`, `quiz_questions` (for offline attempts)
- `attendance`, `timetable`
- `notices`, `materials`

Sync strategy:
- **Read**: stale-while-revalidate via TanStack Query +
  `@tanstack/query-sync-storage-persister` backed by Preferences.
- **Write outbox**: a `pending_mutations` table in SQLite. Each row is
  `{ id, table, op, payload, attempt, createdAt }`.
- **Flush triggers**:
  - `App.addListener('appStateChange', s => s.isActive && flush())`
  - `Network.addListener('networkStatusChange', s => s.connected && flush())`
  - On every successful authenticated request (piggy-back)
- **Conflict policy**:
  - User-owned rows (notes, doubts, quiz attempts before scoring) →
    last-write-wins by `updated_at`.
  - Server-authoritative for `quiz_attempts.score`, `enrollments.status`,
    `attendance.verified`.
- **Schema migrations**: bundle a versioned SQL set; on app boot run
  pending migrations under a single transaction.

### Tier 3 — Media (`@capacitor/filesystem` already installed)
Per-lesson explicit "Download" button:
- PDFs → `Directory.Data`, tracked in existing IndexedDB `downloads`
  store (`src/lib/indexedDB.ts`).
- Videos → only if Bunny signed-URL TTL allows; otherwise re-sign on
  open. Consider HLS via `@capacitor-community/video-player` or accept
  "online-only video" as a documented limit.

### Service-worker boundary
Disable SW on native; keep it on web only:
```ts
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

## 5. Payments / Store Compliance

You currently sell **digital course access** through Razorpay. This is
the single biggest store-review risk in the app.

### 5.1 Apple App Store
- Guideline **3.1.1**: digital goods consumed inside the app **must** use
  StoreKit IAP. Razorpay = guaranteed rejection.
- Even mentioning external pricing or "buy on website" in the iOS build
  violates **3.1.3** (anti-steering), unless you qualify for a reader-app
  or external-link entitlement (rare, requires application + approval).
- Education exception: there is **no general education exemption**.
  "Approved Education" entitlement exists only for managed-classroom apps
  distributed by Apple School Manager — does not apply here.

### 5.2 Google Play
- Play Billing required for in-app digital goods (Payments policy, Sep
  2021 update; enforced Sep 2022).
- "Tuition" is grey: schools with classroom-based instruction sometimes
  qualify as a real-world service (Razorpay OK). A self-serve test-prep
  app like Safar English will most likely be classified as **digital
  content** → Play Billing required.
- "User Choice Billing" pilot may allow Razorpay as a secondary option
  alongside Play Billing in some markets (India is in the pilot for many
  categories) — apply via Play Console.

### 5.3 Recommended path
1. **Immediate (this week)**: behind a build flag
   `import.meta.env.VITE_NATIVE_BUILD`, hide the *Buy* CTA on the APK
   build. Show "Manage your subscription on safarenglishka.vercel.app"
   with a button that opens the system browser (not in-app browser, or
   Apple flags it as a workaround). This unblocks store submission.
2. **Short term (2–4 weeks)**: integrate
   [`@revenuecat/purchases-capacitor`](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
   for both stores. RevenueCat wraps Play Billing + StoreKit with one
   SDK and gives you a webhook to mark `enrollments.active = true` in
   Supabase. Keep Razorpay for the web build only.
3. **Long term**: apply for User Choice Billing on Play to recover Razorpay
   as a secondary option in India.

### 5.4 Refunds
Move `initiate-refund` and `razorpay-refund-webhook` to a code path that
is web-only on native builds. Store refunds happen through Apple/Google
once IAP is live.

---

## 6. Account Deletion (Blocker)

`src/pages/Settings.tsx:194` currently:
```ts
const handleDeleteAccount = () => {
  toast.info("Please contact support to delete your account");
};
```

This **fails**:
- Apple Guideline **5.1.1(v)** — in-app account deletion required since
  June 30 2022.
- Play **User Data policy** — in-app deletion **and** a publicly reachable
  web URL required.

### Required flow
1. UI: red destructive button → `AlertDialog` → typed-confirmation
   ("delete my account") → final confirm.
2. New edge function `delete-account`:
   - Verify JWT.
   - Revoke all sessions for the user.
   - Cancel any active Razorpay subscriptions / RevenueCat entitlements.
   - Soft-delete or anonymize `profiles_public`.
   - Cascade-delete `notes`, `doubts`, `messages`, `comments`,
     `quiz_attempts`, `user_progress`, `user_sessions`,
     `user_preferences`, `user_roles`, `enrollments`.
   - Delete the `auth.users` row via admin client.
3. After 200 OK: clear Preferences, sign out, navigate to `/`.
4. Public URL: a `/delete-account` page that lets a logged-out user
   request deletion by email (proof of email ownership via OTP).
5. Add the URL to Play Console → *App content* → *Data deletion*.

---

## 7. Play Store Submission Checklist

- [ ] Enable Play App Signing (default).
- [ ] `targetSdk = 34+`, `minSdk = 23` (Capacitor 8 defaults are fine).
- [ ] 64-bit ABI only (`arm64-v8a`, `x86_64`) — Capacitor default.
- [ ] App bundle (`.aab`), not APK, for production.
- [ ] **Data Safety form** entries for: Supabase Auth (email, password),
      Supabase tables (profile, progress, attendance), Razorpay
      (financial info, processed by third party), Bunny CDN (video,
      processed by third party), FCM (device IDs for push), location
      (only if added).
- [ ] **Content rating** questionnaire → expect "Everyone".
- [ ] **Privacy policy URL** live and reachable (host on Vercel under
      `/privacy`).
- [ ] **Closed testing** track with 12+ testers for 14 days (mandatory for
      personal Play accounts created after Nov 13 2023).
- [ ] **Screenshots**: 2–8 phone, optional 7"/10" tablet, feature graphic
      1024×500, app icon 512×512.
- [ ] **Permissions justification** for any runtime perm added (camera,
      notifications, location).
- [ ] **Data deletion URL** added to *App content*.
- [ ] **Ads declaration**: "No ads".
- [ ] **Target audience**: ages 13+ (or 18+ if course content warrants).
- [ ] Government / financial / health declarations: all "No".

---

## 8. App Store Submission Checklist

- [ ] `npx cap add ios` — create the iOS project. Use Xcode 15+.
- [ ] Deployment target iOS 14.0 (Capacitor 8 minimum).
- [ ] Bundle identifier `com.safarenglishka.app` (matches Android).
- [ ] **Sign in with Apple** — only required if you add Google/Facebook
      login. Email/password is fine on its own.
- [ ] **IAP** for course purchases (see §5).
- [ ] **In-app account deletion** (see §6).
- [ ] **App Privacy** nutrition labels mirroring Play Data Safety.
- [ ] **Demo account** credentials in App Review notes
      (`reviewer@safarenglishka.app` + password + a pre-enrolled course).
- [ ] **Review notes** explaining: this is a real coaching institute
      (link to website, brand presence, testimonials), live class
      schedule, sample lesson access.
- [ ] `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` once
      avatar upload is wired.
- [ ] `NSUserTrackingUsageDescription` only if you add analytics that
      fingerprint (Mixpanel, AppsFlyer). Otherwise skip ATT entirely.
- [ ] **TestFlight** internal → external (≥1 external tester) before
      submission.
- [ ] Screenshots 6.7" + 6.5" + 5.5" (or use 6.7" only with App Store
      Connect auto-scaling) and iPad 12.9" if you support iPad.

---

## 9. Implementation Order

```text
Week 1  ▸ Blockers
  ├─ Account deletion flow + /delete-account web page + edge function
  ├─ Privacy policy page + /privacy route + Vercel deploy
  ├─ Native build flag + hide Buy CTA on APK
  └─ Add @capacitor/network + offline banner

Week 2  ▸ Mobile polish
  ├─ viewport-fit=cover + safe-area tokens in index.css
  ├─ @capacitor/status-bar + theme-aware status bar
  ├─ @capacitor/keyboard + form padding hooks
  ├─ @capacitor/haptics on primary CTAs
  ├─ Framer Motion route transitions (platform-tuned)
  └─ Disable SW registration on native

Week 3  ▸ Permissions + Offline tier 1+2
  ├─ Declare only-used permissions in AndroidManifest
  ├─ Add in-context permission rationale sheets
  ├─ @capacitor/preferences for auth tokens + prefs
  ├─ @capacitor-community/sqlite + schema + migrations
  └─ TanStack Query persister + outbox

Week 4  ▸ Offline tier 3 + RevenueCat
  ├─ Lesson download UX (queue, progress, delete)
  ├─ RevenueCat SDK + product catalog mirror
  └─ Webhook → Supabase enrollments

Week 5  ▸ iOS bring-up
  ├─ npx cap add ios; icons; splash; Info.plist usage strings
  ├─ StoreKit products in App Store Connect
  ├─ Safe-area QA on notched + Dynamic Island devices
  └─ TestFlight build #1

Week 6  ▸ Submission
  ├─ Play closed-testing track open (start the 14-day clock)
  ├─ Screenshots, listings, Data Safety, App Privacy
  ├─ Reviewer notes + demo account
  └─ Submit
```

---

## 10. Appendix

### 10.1 Plugin install batch
```bash
bun add @capacitor/status-bar @capacitor/keyboard @capacitor/haptics \
        @capacitor/network @capacitor/preferences @capacitor/camera \
        @capacitor/push-notifications @capacitor-community/sqlite \
        @revenuecat/purchases-capacitor
npx cap sync
```

### 10.2 `capacitor.config.ts` deltas
```ts
plugins: {
  // ... existing ...
  Keyboard: { resize: 'body', resizeOnFullScreen: true },
  StatusBar: { overlaysWebView: false, style: 'DARK', backgroundColor: '#ffffff' },
  CapacitorSQLite: {
    iosDatabaseLocation: 'Library/CapacitorDatabase',
    iosIsEncryption: true,
    androidIsEncryption: true,
    androidBiometric: { biometricAuth: false },
  },
},
```

### 10.3 `Info.plist` usage-strings block
```xml
<key>NSCameraUsageDescription</key>
<string>Used to take a profile photo.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Used to choose a profile photo.</string>
<key>NSFaceIDUsageDescription</key>
<string>Used to unlock the app quickly.</string>
<key>NSUserNotificationsUsageDescription</key>
<string>Used to notify you when a live class starts.</string>
```

### 10.4 AndroidManifest additions (only when feature lands)
```xml
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<!-- Only if geofenced attendance ships: -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### 10.5 References
- Apple App Review Guidelines §3.1.1, §3.1.3, §5.1.1(v), §4.2
  https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments Policy
  https://support.google.com/googleplay/android-developer/answer/9858738
- Play User Data / Deletion
  https://support.google.com/googleplay/android-developer/answer/13327111
- Play closed-testing requirement (personal accounts)
  https://support.google.com/googleplay/android-developer/answer/14151465
- Capacitor docs https://capacitorjs.com/docs
- RevenueCat Capacitor https://www.revenuecat.com/docs/getting-started/installation/capacitor
- Capacitor SQLite https://github.com/capacitor-community/sqlite

---

*End of roadmap. No application code was modified to produce this
document.*
