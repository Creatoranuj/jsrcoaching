# Brief — Groups C: Keyboard (#4) + Safe-Area (#14) + Tailwind (#15)

Status: **already wired**; this brief codifies the contract so feature code
stays consistent.

## Single source of truth

| Concept | Where it lives | How to use |
|---|---|---|
| Keyboard height (px) | `--nb-keyboard-h` on `<html>`, published by `installKeyboardInsetTracker` (`src/lib/native/keyboard.ts`) | `padding-bottom: calc(max(env(safe-area-inset-bottom), var(--nb-keyboard-h, 0px)) + 12px)` |
| Safe-area insets (CSS) | `env(safe-area-inset-*)` + cached as `--sat/--sab/--sal/--sar` in `src/index.css` | Tailwind utilities `.safe-area-top/-bottom/-left/-right/-x/-y` |
| Safe-area insets (Tailwind padding) | `padding.safe-t/-b/-l/-r` in `tailwind.config.ts` | `<header className="pt-safe-t">` |
| Combined keyboard + safe area | `<KeyboardSafeArea>` (`src/components/ui/KeyboardSafeArea.tsx`) | Wrap any fixed-bottom CTA, form footer, or input row |

## Rules

1. **Never** hard-code `padding-bottom: 0` on a fixed-bottom element. Either use the `KeyboardSafeArea` component, the `.safe-area-bottom` utility, or the `pb-safe-b` Tailwind padding token.
2. **Viewport must keep `viewport-fit=cover`** in `index.html` — without it `env(safe-area-inset-*)` returns 0 inside the WebView.
3. **Don't add a competing CSS var** (`--kb-inset`, `--keyboard-h`, etc.). If you need a different name, alias inside the component, not in feature CSS.
4. **Android resize mode = `native`** (set both in `capacitor.config.ts` and re-applied by the tracker). Do not switch to `body` — fixed footers detach from the layout.
5. **Inputs that scroll into view on focus** should live inside a scrollable container; rely on the WebView resize, not custom `scrollIntoView` hacks.

## Tailwind tokens already shipped

```ts
// tailwind.config.ts
padding: {
  'safe':   'env(safe-area-inset-bottom)',
  'safe-t': 'env(safe-area-inset-top)',
  'safe-b': 'env(safe-area-inset-bottom)',
  'safe-l': 'env(safe-area-inset-left)',
  'safe-r': 'env(safe-area-inset-right)',
}
```

Add a matching `margin.safe-*` only if a real use-case appears; keeping the token set small prevents drift.

## QA matrix (do this before any release)

- iPhone 14 Pro portrait + landscape — Dynamic Island clears, home indicator clears.
- Pixel 6 (gesture nav + 3-button nav) — bottom CTA clears the bar in both modes.
- Soft-keyboard on a long form — submit button always visible above the keyboard.
- Rotate while keyboard is open — inset updates within one frame.
