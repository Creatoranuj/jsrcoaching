# Brief #8 — Capacitor Security

Security posture for the Safar English APK + Vercel web build.
Companion to `docs/SECURITY_CHECKLIST.md` (which is the operational checklist).

---

## 1. Threat model (what we actually defend against)

| Threat | Mitigation | Where |
|---|---|---|
| Token theft via XSS | httpOnly is N/A in WebView; we move tokens out of `localStorage` into Keystore/Keychain via `@capacitor/preferences`. | `src/lib/nativeStorage.ts` |
| Service-role / payment-secret leak | Zero secrets in frontend bundle. All HMAC + admin work happens in edge functions. | `docs/SECURITY_CHECKLIST.md` |
| Cleartext / downgrade attacks | `cleartextTrafficPermitted="false"` app-wide + per-domain. CSP `upgrade-insecure-requests`. | `network_security_config.xml`, `index.html` |
| Clickjacking of the WebView origin | `frame-ancestors 'none'` in CSP. | `index.html` |
| Inline script injection | CSP scoped to known vendor origins; only `unsafe-inline` retained for boot + Razorpay. Documented exception. | `index.html` |
| Rooted/jailbroken devices | Best-effort warn (non-blocking). Premium video is gated by short-lived signed Bunny tokens regardless. | `src/lib/native/security.ts` |
| MITM via rogue CA | System trust + TLS 1.2+. **No** static pin (managed PKI rotates; pinning causes outages). | `network_security_config.xml` |

## 2. Token storage

The Supabase auth client uses `supabaseAuthStorage` from `src/lib/nativeStorage.ts`:

- **Native:** `@capacitor/preferences` → Android Keystore-backed SharedPreferences / iOS Keychain.
- **Web:** `localStorage` (unchanged; same security boundary as the origin).
- **Migration:** `migrateLocalStorageTokensToPreferences()` runs once per cold start on native and moves any legacy `sb-*` keys out of WebView storage. Idempotent.

Do **not** add `Preferences.set` for raw passwords or card data. The only secret that ever transits Preferences is the Supabase session JWT.

## 3. CSP rationale

`index.html` ships a meta CSP. Each loose directive is justified:

| Directive | Why it's loose | When we can tighten |
|---|---|---|
| `script-src 'unsafe-inline'` | Boot script in `<body>` + Razorpay checkout inject inline scripts. | After migrating boot to an external hashed file AND Razorpay supports nonces in WebView. |
| `script-src 'unsafe-eval'` | `pdf.js` worker uses `eval`. | When we upgrade to a pdf.js build that drops eval (≥ v5 with `disableEval`). |
| `style-src 'unsafe-inline'` | Tailwind runtime + shadcn inline styles. | Not feasible without breaking shadcn — accept. |
| `img-src https:` / `connect-src https:` | Bunny CDN edge hostnames rotate; YouTube thumb hosts are dynamic. | Keep — narrowing breaks playback. |

Always-strict directives (do not relax): `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self' https://*.razorpay.com`.

## 4. Certificate pinning — intentionally NOT enabled

See the comment block at the top of `android/app/src/main/res/xml/network_security_config.xml`. Supabase + Bunny rotate certs on managed PKI; a hard pin without an OTA-deliverable backup pin will brick the APK in the field. If you ever add a `<pin-set>`:

1. Always include a backup pin (one for current leaf, one for next-rotation leaf).
2. Document the rotation calendar in `docs/SECURITY_CHECKLIST.md`.
3. Pair with Capgo OTA so a bad pin can be hot-fixed without a Play Store roll.

## 5. Root / jailbreak posture

`checkDeviceIntegrity()` (in `src/lib/native/security.ts`) warns the user but does not block. Hard-blocking rooted devices is hostile to legitimate power users and our content already has per-request signed token protection.

## 6. Pre-release checklist (delta from operational checklist)

- [ ] `rg "RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|SERVICE_ROLE_KEY" src/` → 0 hits.
- [ ] `capacitor.config.ts` has `webContentsDebuggingEnabled: false` for release.
- [ ] `network_security_config.xml` has `cleartextTrafficPermitted="false"` (both base + domain).
- [ ] CSP unchanged from this brief (or diff reviewed).
- [ ] `migrateLocalStorageTokensToPreferences` still called from boot path.
- [ ] No new `localStorage.setItem('sb-*'…)` introduced.

## 7. What's out of scope here

- Edge-function secrets — covered by `docs/SECURITY_CHECKLIST.md`.
- Push token rotation — covered in Brief #11 (debugging) / #13 (logs).
- E2E auth tests — Group F.
