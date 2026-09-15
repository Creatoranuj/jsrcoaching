# Debugging the Safar English APK / iOS build

Quick reference for inspecting a running Capacitor build on a real device or emulator.

## 1. Enable WebView inspector (dev builds only)

In `capacitor.config.ts`, `webContentsDebuggingEnabled` reads from `CAP_DEBUG`.
Production APKs (default `npm run build`) ship with debugging **disabled** — a
deliberate security choice.

```bash
# Build a debuggable APK / iOS bundle
CAP_DEBUG=1 npm run build
npx cap sync
```

## 2. Android — Chrome DevTools

1. Connect device via USB with **USB debugging** enabled (Settings → Developer options).
2. Open Chrome on your laptop → `chrome://inspect/#devices`.
3. Find **Safar English** under "Remote Target" → click **inspect**.
4. Full DevTools attaches: Console, Network, Elements, Sources (with breakpoints).

### Live device logs (logcat)

```bash
# Only this app's logs, with timestamps
adb logcat --pid=$(adb shell pidof com.safarenglishka.app) -v threadtime

# Filter for JS console output only (Capacitor pipes console.log through chromium)
adb logcat -s "Capacitor:*" "Capacitor/Console:*" "chromium:*"

# Watch for crashes / fatal errors only
adb logcat *:E | grep -iE "fatal|crash|exception"

# Save 5 minutes of logs for sharing
adb logcat -v time -T 300 > /tmp/nb-logs.txt
```

## 3. iOS — Safari Web Inspector

1. On device: Settings → Safari → Advanced → **Web Inspector ON**.
2. On Mac: Safari → Settings → Advanced → **Show Develop menu**.
3. Plug in device → Safari menu → **Develop → [Device Name] → Safar English**.
4. Full inspector attaches.

### Native console logs

```bash
# List devices
xcrun devicectl list devices

# Stream filtered to our app
xcrun devicectl device log stream --device <UUID> \
  --predicate 'process == "Safar English"'

# Simulator equivalent
xcrun simctl spawn booted log stream \
  --predicate 'process == "Safar English"' --level debug
```

## 4. Crash reports

- **Android**: `adb bugreport /tmp/nb-bugreport.zip` — comprehensive snapshot
  including tombstones and ANR traces. Share zip in a doubt thread.
- **iOS**: Settings → Privacy & Security → Analytics & Improvements →
  Analytics Data → look for entries starting with `Safar English-` → tap →
  share via AirDrop / email.

## 5. Common issues — first thing to check

| Symptom | Look at |
| --- | --- |
| White screen after splash | `adb logcat -s chromium:*` for JS errors; verify `dist/` was synced (`npx cap sync`) |
| Plugin "not implemented" | Did you `npx cap sync` after `npm install`? |
| Network requests failing | Is `CAP_DEBUG=1` set? Check Network tab in chrome://inspect. Also confirm `androidScheme: 'https'` in capacitor.config.ts |
| Splash hangs >2s | Look for JS exceptions before React mounts (`SplashHider.tsx` has a 1.5s safety hide) |
| Dark-mode flash on cold start | Already fixed — `#nb-boot` stays cream to match native splash drawable |

## 6. Security posture (manual audit summary)

Last reviewed: 2026-06-06. Scanned for:

- ✅ No hardcoded API keys / secrets in `src/`
- ✅ No cleartext (`http://`) URLs in source
- ✅ No JWTs / passwords stored in `localStorage`
- ✅ No `eval()` or `new Function()` for dynamic imports (use `/* @vite-ignore */`)
- ✅ `dangerouslySetInnerHTML` only used with markdown rendered via DOMPurify
  or with static chart CSS strings
- ✅ `allowMixedContent: false` + `androidScheme: 'https'`
- ✅ WebView debugging gated behind `CAP_DEBUG=1` env var
