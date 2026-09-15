---
name: capacitor-app-exit
description: Cleanly exit a Capacitor Android app via App.exitApp() with a double-press confirmation pattern. Use when the user asks about "back to exit", "exit app", "App.exitApp", "press back again to exit", or wiring the hardware back button's terminal step. iOS has no programmatic exit — this skill is Android-only at runtime but safe to mount everywhere.
---

# Capacitor App Exit (Android)

## When this fires

- Wiring the terminal step of the hardware back chain (after overlays, history, parents, exit-roots are exhausted).
- Adding a "Press back again to exit" toast pattern.
- Adding a Quit menu item on Android.
- Auditing why the app exits on the *first* back press (StrictMode double-listener bug).

## Golden rules

1. **Never call `App.exitApp()` from the first back press on an exit root.** Always require a confirmation — either the double-press toast (preferred) or an `AlertDialog`. Force-exit is hostile and gets store-flagged.
2. **iOS:** `App.exitApp()` is a no-op and Apple rejects apps that programmatically terminate. Guard with `Capacitor.getPlatform() === 'android'`.
3. **Mount the back-button listener ONCE.** Use a module-level `backButtonRegistered` boolean. React StrictMode mounts effects twice → two listeners → both fire → exit on first press.
4. **Dynamic-import `@capacitor/app`** so the web bundle never pulls native code.
5. **Pair with the overlay sentinel** (`window.history.state.pdfFullscreen`, etc.) so back inside a PDF/player/sheet closes the overlay first, not the app.

## Canonical implementation

```ts
// Module-level guard — survives StrictMode/HMR remounts.
let backButtonRegistered = false;
let lastBackPress = 0;
const EXIT_ROUTES = new Set(["/", "/dashboard"]);
const EXIT_WINDOW_MS = 2000;

export function useAndroidBackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (backButtonRegistered) return;
    backButtonRegistered = true;

    let remove: undefined | (() => void);
    (async () => {
      try {
        const { Capacitor } = await import(/* @vite-ignore */ "@capacitor/core");
        if (Capacitor.getPlatform() !== "android") return;
        const { App } = await import(/* @vite-ignore */ "@capacitor/app");
        const handle = await App.addListener("backButton", async ({ canGoBack }) => {
          // 1. Overlay sentinel — let popstate handlers close PDFs/players/sheets.
          if (window.history.state?.pdfFullscreen || window.history.state?.playerFullscreen) {
            window.history.back();
            return;
          }
          // 2. Auth route + already signed in → home.
          // 3. In-app trail / route parents / known children — your routing rules.

          // 4. Exit roots → double-press confirm.
          if (EXIT_ROUTES.has(window.location.pathname)) {
            const now = Date.now();
            if (now - lastBackPress < EXIT_WINDOW_MS) {
              await App.exitApp();   // ← only here, only Android, only second press
              return;
            }
            lastBackPress = now;
            toast("Press back again to exit", { duration: EXIT_WINDOW_MS });
            return;
          }
          // 5. Fallback
          canGoBack ? window.history.back() : navigate("/dashboard");
        });
        remove = () => handle.remove();
      } catch { /* web */ }
    })();

    return () => {
      remove?.();
      backButtonRegistered = false;
    };
  }, [navigate]);

  // Reset the double-press window when the user navigates away from an exit root.
  useEffect(() => {
    if (!EXIT_ROUTES.has(location.pathname)) lastBackPress = 0;
  }, [location.pathname]);
}
```

Mount once near the router root:

```tsx
function AppShell() {
  useAndroidBackButton();
  // ...
}
```

## Alternative: explicit Quit dialog

Use when the product wants an explicit confirmation (e.g. kiosk/exam apps):

```ts
const confirmed = window.confirm("Exit the app?");
if (confirmed) await App.exitApp();
```

Don't ship both patterns — pick one. Double-press is faster and more native-feeling; AlertDialog is clearer for first-time users.

## Anti-patterns

| Bug | Cause | Fix |
| --- | --- | --- |
| First back press exits app | StrictMode mounted effect twice → two listeners → both fire | Module-level `backButtonRegistered` guard |
| `App.exitApp()` does nothing on iOS, then store-rejected | No platform guard | `if (Capacitor.getPlatform() !== 'android') return` early in the listener registration |
| `lastBackPress` never resets after navigating away from `/dashboard`, so a delayed back press silently exits | No location reset | Reset in a second effect keyed on `location.pathname` |
| Back inside open PDF exits app | Overlay never pushed `history.state` sentinel | Overlay opens with `window.history.pushState({ pdfFullscreen: true }, "")` and listens for `popstate` |
| Web build crashes importing `@capacitor/app` | Static import | Dynamic `await import(/* @vite-ignore */ "@capacitor/app")` inside try/catch |
| Toast spam on rapid presses | No `lastBackPress` cooldown | Throttle to `EXIT_WINDOW_MS` |

## Testing checklist

- [ ] APK on real device — double-press from `/dashboard` exits within 2 s window.
- [ ] APK — single press inside open PDF closes PDF, app stays alive.
- [ ] APK — navigate `/dashboard → /courses → /dashboard`, double-press exits (cooldown reset).
- [ ] iOS build — back-button hook is a no-op, no `App.exitApp()` invoked.
- [ ] Web preview — no console errors, browser back behaves normally.
- [ ] HMR / Fast Refresh does not duplicate the listener (check listener count once registered).

## Related skills

- `capacitor-back-button` — full priority chain (overlays → history → parents → exit roots → exit).
- `capacitor-best-practices` — dynamic-import pattern and the bridge layer.
