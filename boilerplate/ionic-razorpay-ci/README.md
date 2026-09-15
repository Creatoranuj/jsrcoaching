# Ionic + React + Capacitor + Razorpay + GitHub Actions Boilerplate

Standalone reference project. **Independent of the parent Naveen Bharat app.**

## Stack
- React 18 + Vite + TypeScript
- Ionic React 8 (`@ionic/react`, `@ionic/react-router`)
- Capacitor 6 (`@capacitor/core`, `@capacitor/android`)
- Razorpay native checkout via [`razorpay/razorpay-capacitor`](https://github.com/razorpay/razorpay-capacitor)
- GitHub Actions → unsigned debug APK artifact

## Local setup
```bash
cd boilerplate/ionic-razorpay-ci
npm install
npm run dev              # web preview at http://localhost:5174
```

## Build the Android APK locally
```bash
npm run build
npx cap add android      # first time only
npx cap sync android
npx cap open android     # opens Android Studio → Run on device/emulator
```

## Razorpay keys
1. Open `src/services/OrderService.ts` and replace `rzp_test_REPLACE_ME` with your Razorpay test **Key ID** (public, safe to ship).
2. **Never** put `RAZORPAY_KEY_SECRET` in client code. In production, replace `createOrderMock` with `createOrderFromBackend` and host an order-creation endpoint that calls `https://api.razorpay.com/v1/orders` with the secret in a server-side env var.
3. Verify `payment.signature` on the backend (HMAC-SHA256, timing-safe).

## CI/CD (GitHub Actions)
Workflow: `.github/workflows/android-build.yml`. Triggers on push to `main` and manual dispatch. Steps: checkout → Node 20 + JDK 17 + Android SDK → `npm ci` → `npm run build` → `npx cap add/sync android` → `./gradlew assembleDebug` → upload `app-debug.apk` artifact.

Download from **Actions → workflow run → Artifacts**.

### Signed release
Add these GitHub repo secrets:

| Secret | How to generate |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Keystore alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Then decode the keystore before `assembleRelease` and wire `signingConfigs.release` in `android/app/build.gradle`.

## Security checklist
- [x] `RAZORPAY_KEY_ID` in client (publishable) — OK
- [ ] `RAZORPAY_KEY_SECRET` never in client — backend only
- [ ] Backend verifies `payment.signature` (HMAC-SHA256, timing-safe)
- [ ] Webhook handler verifies `X-Razorpay-Signature` and is idempotent
- [ ] Order amount fetched server-side (never trust client)

## Out of scope
- iOS platform (requires macOS + Xcode)
- Real backend order endpoint (per-project: Supabase Edge Function, Node, etc.)
- Subscriptions (use Razorpay Subscriptions API)
- Play Console submission (signing, content rating, privacy policy, testing tracks)
