# Brief — Group E: Splash (#9) + Debugging (#11) + iOS/Android Logs (#13)

## #9 — Splash screen

### Current behaviour

- Native splash is JS-controlled (`launchAutoHide: false` in `capacitor.config.ts`).
- `SplashHider.tsx` hides the native splash on `document.fonts.ready` → double-rAF, with a 1.5s safety timeout.
- Inline boot screen (`#nb-boot` in `index.html`) bridges any gap between native-splash-hide and React's first paint; removed by `MutationObserver` on `<root>`, hard-killed at 3s.

### Assets pipeline (not yet automated)

When ready to refresh splash artwork:

```bash
# Place 2732x2732 source at resources/splash.png (+ resources/splash-dark.png)
npm i -D @capacitor/assets
npx capacitor-assets generate
npx cap sync
```

Until then, the project ships the warm-paper #F7F4EE background defined in `capacitor.config.ts > SplashScreen.backgroundColor`. Match any new artwork to that exact hex to avoid the cold-start flash.

### Dark mode

Add `resources/splash-dark.png` and re-run `capacitor-assets generate`. The plugin writes `values-night/colors.xml` for Android and a dark variant of `LaunchScreen.storyboard` for iOS automatically.

---

## #11 — Debugging Capacitor

### Layered approach

1. **WebView devtools (dev only).** Set `webContentsDebuggingEnabled: true` in `capacitor.config.ts` for local builds; the release CI flag is already `false`. On Android open `chrome://inspect`; on iOS use Safari → Develop menu.
2. **Native logs.** Use `scripts/logs-android.sh` / `scripts/logs-ios.sh` (see #13).
3. **Runtime overlay.** `PerfOverlay` (Group #6) shows Web Vitals + bridge call count + persistent-cache hits. Toggle by adding `?nbPerf=1` to the preview URL.
4. **Sentry.** `src/lib/sentry.ts` initialises when `VITE_SENTRY_DSN` is set. Errors thrown from a `BridgeError` (Group A) carry `.code` + `.plugin` tags automatically — filter Sentry by `tags.bridge.code:BRIDGE_PERMISSION` etc.

### Bridge call tracing

`src/lib/perf/bridgeMeter.ts` patches `Capacitor.nativeCallback` and counts calls per plugin. In dev, `console.table(getBridgeCallTable())` from the devtools console prints the breakdown — useful for spotting accidental hot-paths.

### Common pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| Plugin throws "Not implemented on web" | Missing `requireNative` guard | Wrap with `safeCall(..., { fallback })` |
| White-flash before app loads | Splash hiding before React mounts | Don't override `SplashHider`'s gating |
| Deep link opens browser, not app | AASA/assetlinks fingerprint mismatch | See Brief #3 |
| `localStorage` empty after release update | Capgo OTA bundle change wiped WebView storage | Use Preferences for anything persistent |

---

## #13 — iOS / Android logs

### One-liner reference

```bash
# Android (device or emulator must be ADB-attached)
./scripts/logs-android.sh

# iOS (booted simulator)
./scripts/logs-ios.sh
```

Both scripts:
- Verify the required toolchain (`adb` / `xcrun`).
- Filter to the `com.safarenglishka.app` package / `"Safar English"` process.
- Stream colorised output until Ctrl+C.

### Real iOS device

`scripts/logs-ios.sh` covers the simulator only. For a tethered device:

```bash
xcrun devicectl list devices
xcrun devicectl device log stream --device <DEVICE_UUID> \
  --predicate 'process == "Safar English"'
```

### Capturing a crash bundle

Android:
```bash
adb bugreport ./crash-$(date +%s).zip
```

iOS:
```bash
# Window → Devices and Simulators → select device → "View Device Logs"
# Or: xcrun simctl spawn booted log collect --output ./ios-log.logarchive
```

Attach the resulting file to a Sentry issue or paste the relevant frames into the bug report.
