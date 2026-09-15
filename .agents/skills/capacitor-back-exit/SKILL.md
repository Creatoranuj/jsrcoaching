---
name: capacitor-back-exit
description: Professional, App-Store-grade Android hardware back button + app exit handling for Capacitor + React/Vite apps. Use when wiring up back navigation, modal/sheet dismissal, video/PDF viewer dismissal, double-back-to-exit, or fixing accidental app exits.
---

# Capacitor Back Button & App Exit — Professional Pattern

Goal: behave exactly like a polished native Android app.

1. Back closes the topmost layer first (modal → sheet → fullscreen PDF/video → in-app history).
2. At the root of the app, back asks user to confirm with a "Tap again to exit" toast (double-back-to-exit, 2s window).
3. Web/iOS are unaffected — handler is a no-op outside Android Capacitor.

## When to use

- New Capacitor Android build that exits on first back press.
- Modals/sheets/fullscreen viewers that should be dismissed by hardware back, not the page.
- Replacing scattered `App.addListener('backButton', ...)` with one priority-based handler.

## Architecture

Single global controller (`BackButtonController`) mounted once in `App.tsx`. Anything that wants to intercept back registers a handler with a numeric priority; highest priority wins. Handler returns `true` if it consumed the event, else `false` to fall through.

```
priority 100  — open Dialog / Sheet / Drawer
priority  80  — fullscreen viewer (PDF, video, image)
priority  60  — in-page panel / sidebar
priority  20  — react-router history fallback
priority   0  — root: double-back-to-exit
```

## Files to create

### `src/lib/back-button.ts`

```ts
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

type Handler = () => boolean | Promise<boolean>;
interface Entry { id: number; priority: number; handler: Handler }

const entries: Entry[] = [];
let nextId = 1;
let installed = false;

export function registerBack(handler: Handler, priority = 50): () => void {
  const id = nextId++;
  entries.push({ id, priority, handler });
  entries.sort((a, b) => b.priority - a.priority);
  return () => {
    const i = entries.findIndex(e => e.id === id);
    if (i >= 0) entries.splice(i, 1);
  };
}

export async function installBackButton() {
  if (installed) return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  installed = true;
  await App.addListener("backButton", async ({ canGoBack }) => {
    for (const e of entries) {
      const consumed = await e.handler();
      if (consumed) return;
    }
    if (canGoBack) window.history.back();
    else await confirmExit();
  });
}

let lastExitPrompt = 0;
async function confirmExit() {
  const now = Date.now();
  if (now - lastExitPrompt < 2000) {
    await App.exitApp();
    return;
  }
  lastExitPrompt = now;
  window.dispatchEvent(new CustomEvent("app:exit-prompt"));
}
```

### `src/hooks/useBackButton.ts`

```ts
import { useEffect } from "react";
import { registerBack } from "@/lib/back-button";

export function useBackButton(handler: () => boolean | Promise<boolean>, priority = 50, deps: any[] = []) {
  useEffect(() => registerBack(handler, priority), deps); // eslint-disable-line react-hooks/exhaustive-deps
}
```

### Mount once in `App.tsx`

```tsx
import { useEffect } from "react";
import { installBackButton } from "@/lib/back-button";
import { toast } from "sonner";

useEffect(() => {
  installBackButton();
  const onPrompt = () => toast("Press back again to exit", { duration: 2000 });
  window.addEventListener("app:exit-prompt", onPrompt);
  return () => window.removeEventListener("app:exit-prompt", onPrompt);
}, []);
```

## Usage examples

Modal:
```tsx
useBackButton(() => { if (open) { setOpen(false); return true; } return false; }, 100, [open]);
```

Fullscreen PDF viewer:
```tsx
useBackButton(() => { if (selectedPdf) { setSelectedPdf(null); return true; } return false; }, 80, [selectedPdf]);
```

Router fallback (lowest non-zero):
```tsx
useBackButton(() => {
  if (location.pathname !== "/" && location.pathname !== "/dashboard") {
    navigate(-1);
    return true;
  }
  return false;
}, 20, [location.pathname]);
```

## QA checklist

- [ ] Cold-start, press back at root → toast appears, second press within 2s exits.
- [ ] Open modal → back closes modal, does not navigate.
- [ ] Open PDF viewer → back closes PDF, second back goes to previous page.
- [ ] Nested route → back walks history correctly, never jumps to root.
- [ ] iOS / web → no behavior change, no errors in console.
- [ ] Rotation / suspend-resume → handler list intact (no duplicate listeners).

## Anti-patterns (do not do)

- Calling `App.addListener("backButton", ...)` from multiple components — listeners stack and fire in undefined order.
- Using `window.history.length` to decide exit — unreliable inside SPAs.
- Exiting on first back press without confirmation — flagged by Play Store reviewers as poor UX.
- Wrapping `App.exitApp()` in a custom Android `MainActivity` override — keep exit purely in JS so behavior matches dev preview.

## Plugin

Requires `@capacitor/app`. Install with `npm i @capacitor/app && npx cap sync android`.
