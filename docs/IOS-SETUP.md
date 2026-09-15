# iOS Setup — Universal Links & Splash

The repo currently has no `ios/` folder. Do these steps on a Mac with Xcode.

## 1. Add the iOS platform

```bash
npm install --legacy-peer-deps --no-audit --no-fund
npx cap add ios
npm run build
npx cap sync ios
npx cap open ios
```

## 2. Enable Associated Domains (Universal Links)

In Xcode:
1. Select the `App` target → **Signing & Capabilities**.
2. Click **+ Capability** → **Associated Domains**.
3. Add: `applinks:safarenglishka.vercel.app`

## 3. Fix the AASA file

Edit `public/.well-known/apple-app-site-association` and replace `TEAMID`
with your Apple Developer Team ID (found at developer.apple.com → Membership).

The final `appID` should look like `ABCDE12345.com.safarenglishka.app`.

Redeploy to Vercel. Verify:
```bash
curl -I https://safarenglishka.vercel.app/.well-known/apple-app-site-association
# Content-Type must be application/json
```

## 4. Splash assets (optional, when you have a source SVG)

```bash
# Place 2732x2732 PNG at resources/splash.png and resources/icon.png
npm i -D @capacitor/assets
npx capacitor-assets generate --ios
```

The native splash auto-hides after 1.5s and `src/components/SplashHider.tsx`
also hides it on first React paint. This prevents a stuck splash screen if
the WebView or JavaScript load fails.

## 5. Test

- Universal link cold start: long-press the link in iMessage/Notes → tap → app opens.
- Warm start: open app, then tap link from Safari.
- If it opens in Safari instead, check: AASA `Content-Type`, Team ID, entitlement.
## Debugging logs

Stream live device logs from the project root:

```bash
./scripts/logs-android.sh   # connected Android device/emulator
./scripts/logs-ios.sh       # booted iOS simulator
```

For a real iOS device:
```bash
xcrun devicectl list devices
xcrun devicectl device log stream --device <UUID> --predicate 'process == "Safar English"'
```

See `docs/SKILLS.md` for the full release & debug pipeline.

## File downloads (Info.plist)

After `npx cap add ios`, edit `ios/App/App/Info.plist` and add the following
keys so PDFs/notes saved by the app appear in the iOS **Files** app under
"On My iPhone → Safar English":

```xml
<key>UIFileSharingEnabled</key>
<true/>
<key>LSSupportsOpeningDocumentsInPlace</key>
<true/>
```

App-private writes via `@capacitor/filesystem` `Directory.Data` work
without any permission prompt on iOS — these keys only control whether the
folder is browsable from the Files app.
