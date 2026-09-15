---
name: capacitor-back-button
description: Android hardware back-button handling for Capacitor apps. Use when implementing or fixing back-navigation, double-tap-to-exit, modal/sheet dismissal on back, or fullscreen overlay (PDF/video) back behavior.
---

# Capacitor Hardware Back Button

A robust, single-source-of-truth pattern for handling the Android hardware back button in a Capacitor + React Router app. iOS has no hardware back button — this skill is Android-only at runtime, but safe to mount everywhere.

## When to Use

- User reports: "back button exits app immediately"
- User reports: "back button does nothing inside a PDF/video fullscreen"
- User reports: "back button doesn't close my dialog/sheet"
- Adding new fullscreen overlays that should be closable with back
- Adding new "exit roots" (extra home-like pages)

## Architecture

ONE hook, mounted ONCE near the router root. Module-level `backButtonRegistered` guard prevents StrictMode double-mount from registering two listeners (the cause of the classic "press back once, app exits" bug).

Priority chain on every back press:

1. **Fullscreen overlay pop** — if `window.history.state.pdfFullscreen` or `playerFullscreen` is set, call `window.history.back()` so the overlay's popstate handler closes it. Overlays must push a sentinel state on open.
2. **Auth route guard** — on `/login`, `/signup`, etc., when already authenticated, redirect to `/dashboard`.
3. **Navigation trail** — prefer the in-app navigation history (a `NavigationHistoryContext`) over hard-coded parents. Only fall back to hardcoded rules when there is no trail.
4. **Route-aware parents** — regex-match nested routes (`/classes/:id/lessons`, `/course/:id`, etc.) and `navigate(parent, { replace: true })`.
5. **Known children** — flat list of pages that always go to `/dashboard` (downloads, settings, profile, …).
6. **Exit roots** — `/` and `/dashboard`: first press shows a `Press back again to exit` toast (2 s window), second press calls `App.exitApp()`.
7. **Fallback** — `canGoBack` → `history.back()`, else `/dashboard`.

## Reference Implementation

Lives at `src/hooks/useAndroidBackButton.ts`. Mount once in `src/App.tsx`:

```tsx
function AppShell() {
  useAndroidBackButton(); // mount once, anywhere under <BrowserRouter>
  // …
}
```

Module-level guard:

```ts
// Prevents StrictMode/HMR/remount from registering two listeners — the
// classic cause of "first back press exits app".
let backButtonRegistered = false;
```

Dynamic import of `@capacitor/app` so web builds never bundle native code:

```ts
const { App } = await import(/* @vite-ignore */ "@capacitor/app");
```

## Fullscreen Overlay Contract

Any component that opens a fullscreen overlay (PDF viewer, video player, Smart Notes reader) must:

1. **On open**: `window.history.pushState({ pdfFullscreen: true }, "")` (or `playerFullscreen`).
2. **Listen for `popstate`**: close itself when popped.
3. **On user-triggered close**: `window.history.back()` to pop the sentinel.

The back-button hook checks `window.history.state?.pdfFullscreen` first and just calls `history.back()` — the overlay's own popstate listener does the close. This keeps overlay logic local and avoids a registry of "things that need to be closed".

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| First back press exits app | Two listeners registered (StrictMode) | Module-level `backButtonRegistered` guard |
| Back inside PDF jumps to dashboard | Overlay didn't push sentinel state | Push `{pdfFullscreen:true}` on open |
| Toast says "press again" but never exits | `lastBackRef` not reset on route change | `useEffect` to reset when path leaves EXIT_ROUTES |
| Web preview behaves weirdly | Trying to import `@capacitor/app` on web | Wrap import in try/catch; it's a no-op on web |
| Plugin works in dev, dead in release APK | `pkg = "@capacitor/app"` const + `/* @vite-ignore */` not used | Vite tree-shakes it out. Keep the indirection. |

## Testing Checklist

- [ ] APK, double-tap on `/dashboard` exits app
- [ ] APK, single back on `/courses` goes to `/dashboard`
- [ ] APK, back inside open PDF closes PDF, not the page
- [ ] APK, back inside open Sheet/Dialog closes it (via overlay contract or Radix's own behavior)
- [ ] APK, on `/login` while authenticated, back redirects to `/dashboard`
- [ ] Web preview: no console errors, browser back works normally
- [ ] HMR / Fast Refresh does not duplicate the listener

## Related

- `useDeepLinks` — deep-link handling that interacts with history
- `NavigationHistoryContext` — provides the in-app trail used in priority 3
- `ExitHint` — UI for the "press back to exit" toast
