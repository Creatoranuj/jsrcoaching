# Ground-Level Report — Safar English (Capacitor + Vite + React Router)

> Read-only senior-architect audit. Performance, security, and end-to-end
> browser test executed in the Lovable preview using test credentials.
> The same `dist/` is bundled into the APK via `npm run build → npx cap
> sync android`, so all findings below apply equally to web and APK.

---

## 1. Overall Status

**NOT YET READY for Play / App Store submission.**

Code quality, performance, and security posture are strong. Three
business/compliance items still block a clean submission:

1. **In-app account deletion is a stub** (Play + Apple blocker).
2. **No Google Play Billing for digital subscriptions** — Razorpay only.
   Web is fine; APK on Play needs either a Play-build flag that hides the
   paywall (already shipped via `IS_PLAY_BUILD`) **or** a real Play
   Billing integration before subscriptions can ship on Play.
3. **Hero PNG assets are heavy** (8 images × ~1.5–1.8 MB each). Web LCP
   and APK first-launch payload both suffer. Not a hard blocker, but a
   reviewer-perception risk.

Everything else (back button, fullscreen, deep links, OTA, splash, RLS,
edge functions, manifest hardening) is production-grade.

---

## 2. Performance Summary (capacitor-performance skill)

Production build completed in 12.7 s. **0 build errors.**

### Chunk sizes (gzipped)

| Chunk | Raw | Gzip | Note |
|-------|-----|------|------|
| `vendor-md-editor` | 928.5 KB | **319.8 KB** | 🟠 only loaded on Admin CMS — confirm it is lazy-pulled (it is — Admin routes are `React.lazy`). |
| `vendor-charts` (recharts) | 383 KB | 105 KB | 🟡 used by analytics — already split. |
| `vendor-supabase` | 207 KB | 53 KB | 🟢 fine for a primary dep. |
| `index` (entry) | 187 KB | 56 KB | 🟢 healthy entry. |
| `vendor-misc` | 187 KB | 60 KB | 🟡 sonner + cmdk + embla — acceptable. |
| `vendor-ui` (Radix) | 132 KB | 40 KB | 🟢 |
| `MahimaGhostPlayer` | 27 KB | 8.4 KB | 🟢 lazy. |

All 50+ pages are split (`React.lazy`) except the critical-path trio
`Index`, `Login`, `Dashboard` — correct. **No regression.**

### Image audit

- 8 hero/landing PNGs are **1.3–1.8 MB each (~13 MB total)**. 🟠
  Recommend converting to WebP or AVIF via `vite-imagetools` — likely
  60–80 % size cut. Affects web LCP and APK install size.
- 22 of 57 `<img>` tags use `loading="lazy"`. Acceptable for above-the-fold
  images (which should be eager) but worth a spot-check on long course
  lists.
- Logo + small icons are fine.

### Listener cleanup ✅

- `useAndroidBackButton.ts` — singleton guard against StrictMode/HMR
  double-registration, listener `.remove()` on unmount.
- `useDeepLinks.ts` — proper cleanup.
- `useFakeFullscreen.ts` — `fullscreenchange` reconciler with cleanup.
- All three video players (`BunnyStreamPlayer`, `MahimaVideoPlayer`,
  `MahimaGhostPlayer`) `removeEventListener` on all `document`/`window`/
  `node` listeners.

### Bridge calls ✅

Capacitor `App.addListener` is called exactly once per app lifecycle from
`BackButtonHandler`. `Filesystem`, `CapacitorUpdater` are called on
explicit user / interval triggers — no per-render bridge traffic.

### Re-render hotspots ✅

`App.tsx` is `memo`'d, `QueryClient` defaults set `refetchOnWindowFocus
false`, lists use TanStack Query with `staleTime`. Nothing flagged.

**Performance verdict: 1 warning (heavy hero images), 0 criticals.**

---

## 3. Security Summary (Capsec principles)

| Rule family | Result |
|-------------|--------|
| **Hardcoded secrets in `src/`** | ✅ None. Only `SUPABASE_PUBLISHABLE_KEY` (anon, safe to ship) in `src/integrations/supabase/client.ts`. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | ✅ Read via `Deno.env.get()` only in edge functions `verify-razorpay-payment`, `verify-subscription-payment`, `initiate-refund`. Never imported into the React bundle. |
| Razorpay frontend `key` | ✅ Returned by edge function `create-subscription-order` / `create-razorpay-order` as `orderData.key_id` at runtime — the **public** Razorpay key id, which is by design client-visible. |
| `service_role` key | ✅ Not present anywhere in `src/` or `public/`. |
| `usesCleartextTraffic` | ✅ `false` in `AndroidManifest.xml`. |
| `android:allowBackup` | ✅ `false`. |
| `webContentsDebuggingEnabled` | ✅ `false` in `capacitor.config.ts`. |
| `cleartext` in Capacitor server | ✅ Server block removed for production; only `androidScheme: 'https'`. |
| `network_security_config.xml` | ✅ Cleartext denied app-wide, TLS pinned to system anchors, supabase + vercel domains explicitly forbidden cleartext. |
| `data_extraction_rules.xml` | ✅ Blocks adb + cloud backups. |
| App links `autoVerify` | ✅ Enabled for `safarenglishka.vercel.app`. |
| OTA endpoint | ✅ GitHub Releases JSON over HTTPS. |

**Security verdict: 0 critical, 0 high. No frontend secrets leaked.**

> Cosmetic console noise: `manifest.json` 401, `apple-mobile-web-app-capable
> is deprecated`. Neither is a security issue — both originate from the
> Lovable preview wrapper, not the app.

---

## 4. Functional Test Results (Lovable preview, 414×896)

Logged in as the supplied test account; auth succeeded; session
established; bottom nav, header, sidebar all rendered.

| # | Flow | Result |
|---|------|--------|
| 1 | Login → `/dashboard` | ✅ Loads, Quick Actions tiles render, dark theme intact. |
| 2 | `/my-courses` | ✅ Loads, "2 courses enrolled", filter chips work, course card renders. |
| 3 | Open course → lesson list | ⚠️ Test account's only course shows **"No lessons yet"** — could not exercise the video player end-to-end via this account. Code review (see §5) confirms the fullscreen + settings paths are correctly wired. |
| 4 | `/settings` → **Delete Account** | 🔴 **Blocker confirmed.** Click shows toast `"Please contact support to delete your account"`. No dialog, no real deletion. `Settings.tsx:194` — `handleDeleteAccount` is still a stub. |
| 5 | `/subscription` | ✅ Renders the 3-tier paywall (Weekly ₹149 / Monthly ₹399 / Yearly ₹1999), trial badge, Subscribe buttons. Catalog rows verified directly in DB. ⚠️ Brief flash of empty-white during the lazy-chunk fetch because `Subscription.tsx` does not wrap its content in `bg-background`. Cosmetic. |
| 6 | Double-back exit hint | ⏭️ Not testable in browser (no hardware back). Code path verified: `useAndroidBackButton` triggers `<ExitHint>` on second tap within 2 s on exit routes. |
| 7 | Browser back from fullscreen | ⏭️ Not testable in browser. Code path verified: `popstate` listener in `MahimaGhostPlayer` + `useFakeFullscreen` both call `document.exitFullscreen()` before letting the back propagate. |

### Console / network during the run

- `manifest.json` 401 on every route — Lovable preview wrapper, ignore.
- `web-share` feature warning — comes from Razorpay's script, harmless.
- `postMessage` origin mismatches — Lovable iframe instrumentation.
- **Zero React runtime errors. Zero application-level failures.**

---

## 5. Code-level Verification of Items Not Reachable Live

### Video player fullscreen exit (3 players)

Each player registers `fullscreenchange` + `webkitfullscreenchange`,
reconciles `isFullscreen` state from `document.fullscreenElement`, resets
`document.body.style.overflow`, and pushes a `playerFullscreen` history
entry on enter. `MahimaGhostPlayer.tsx` adds a `popstate` listener that
calls `document.exitFullscreen()` if a fullscreen element is present
when back is pressed. No leftover listeners on unmount.

### Android back button

`useAndroidBackButton.ts` checks, in order: open menu → close, fullscreen
active → exit fullscreen, route stack → pop, exit route → double-tap to
exit with `<ExitHint>` pill. Singleton guard prevents StrictMode double
registration. Listener removed on unmount. Web fallback no-ops.

### Account deletion (Play/Apple requirement)

Still a stub:
```tsx
// src/pages/Settings.tsx:194
const handleDeleteAccount = () => {
  toast.info("Please contact support to delete your account");
};
```
Needs: confirm dialog → call an edge function that deletes the auth user
+ cascades user rows → sign out → toast.

---

## 6. Remaining Blockers vs `docs/STORE-READINESS.md`

| # | Item | Status |
|---|------|--------|
| 1 | In-app account deletion | 🔴 **Open** (stub). |
| 2 | Payments compliance | 🟠 Partially mitigated by `IS_PLAY_BUILD` flag hiding paywall on Play. Real Play Billing still required for Play subscriptions. |
| 3 | iOS platform (`ios/`) missing | 🟠 Open. |
| 4 | Safe-area + `viewport-fit=cover` | ✅ **Done** — meta set, `env(safe-area-inset-*)` used in `index.css`. |
| 5 | Offline cache beyond shell SW | 🟡 Open (not a blocker). |
| 6 | Native permissions declarations | 🟡 Manifest still only declares `INTERNET`. Not a blocker if no camera/location/notifications used. |
| 7 | `@capacitor/status-bar`, `keyboard`, `haptics`, `network` | 🟡 Open (polish). |
| 8 | Privacy policy page wired to listing | 🟠 Open. |
| 9 | Play closed-testing track (14-day rule) | 🟠 Open (wallclock). |
| 10 | Service worker inside Capacitor WebView | 🟡 Open. |

---

## 7. Prioritized Next Steps

1. 🔴 **Implement real account deletion** (`Settings.tsx` + new edge
   function `delete-account`). 0.5 day. Unblocks Play + Apple.
2. 🟠 **Optimize hero PNGs to WebP/AVIF** via `vite-imagetools`. 0.25 day.
   Cuts ~10 MB from APK + improves web LCP.
3. 🟠 **Write a privacy policy page** at `/privacy` and link it from
   Settings + store listing. 0.5 day.
4. 🟠 **Decide payments strategy for Play:** keep `IS_PLAY_BUILD=true`
   for the first submission (paywall hidden, course one-shot via
   Razorpay only — Play allows physical/educational service purchases
   outside billing in many regions), then plan Play Billing integration
   for v2. 0.5 day decision + 1–3 wk implementation later.
5. 🟡 Add `bg-background min-h-screen` to `Subscription.tsx` outer div
   to remove the white-flash on lazy-load. 5 min.
6. 🟡 Start a Play closed-testing track now so the 14-day wallclock
   begins counting in parallel.
7. 🟡 Add iOS platform (`npx cap add ios`) on a Mac when available.

---

## 8. Summary line

**Web + APK runtime is solid. Performance and security gates pass. One
real product blocker (account deletion) and one perception blocker
(hero image weight) stand between you and a clean Play submission.**

_Generated 2026-05-20. Used capacitor-best-practices, capacitor-performance,
capacitor-security skills. No source files modified during this audit._
