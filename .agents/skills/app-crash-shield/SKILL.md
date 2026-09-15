---
name: app-crash-shield
description: Diagnose and prevent Capacitor/WebView app crashes, freezes, and unresponsive UI in Naveen Bharat — memory leaks, OOM, unhandled rejections, and frozen webviews. Use when users report "app crashes after some time", "screen freezes", "touch not working", "app needs reinstall".
type: feature
---

# App Crash Shield

Project-grounded crash-prevention playbook for the Naveen Bharat Capacitor app.

## When to use
- User says: "app crash ho rha hai", "touch kaam nahi karta", "screen freeze ho gayi", "app hang ho jata hai"
- App becomes unresponsive after extended use (PDF reading, video, long sessions)
- Black/white screen with no input response
- Random restarts on Android

## Root-cause checklist (in order)

1. **Memory pressure (OOM)** — most common on low-RAM Android
   - PDF viewer not unmounted (`react-pdf` keeps pages in memory)
   - Video player not released on route change
   - IndexedDB/blob URLs not revoked (`URL.revokeObjectURL`)
   - Large query cache (check `queryPersister` size)
2. **Unhandled promise rejections** crashing the WebView context
3. **Event listener leaks** — back-button, resize, visibility listeners stacking up across navigations
4. **Frozen main thread** — long sync work blocking input
5. **WebView process killed by Android** when backgrounded with high memory

## Fixes implemented in this repo
- `src/lib/crashShield.ts` — heartbeat watchdog + global rejection handler + auto-reload
- `src/components/ErrorBoundary.tsx` — auto-recovery with retry limit (no infinite loop)
- `src/lib/perf/queryPersister.ts` — bounded cache size
- `useResumeRecovery` hook — refreshes stale state on app resume

## Diagnose live
```bash
# Android crash logs
adb logcat | grep -iE "AndroidRuntime|chromium|WebView|lowmemorykiller|naveenbharat"

# Memory pressure
adb shell dumpsys meminfo com.naveenbharat.app
```
Look for: `FATAL EXCEPTION`, `Out of memory`, `Killed by lmkd`, `RENDERER_UNRESPONSIVE`.

## Verify a fix
1. Cold start → navigate through PDF → video → back → repeat 20× → app must stay responsive
2. `adb shell am send-trim-memory com.naveenbharat.app COMPLETE` → app must survive
3. Background app 10 min → resume → input must work within 2s

## Anti-patterns to flag
- `useEffect` adding listeners without cleanup
- `setInterval` without `clearInterval`
- Storing large blobs in React Query cache
- Calling `window.location.reload()` inside ErrorBoundary without retry guard (infinite reload loop)
