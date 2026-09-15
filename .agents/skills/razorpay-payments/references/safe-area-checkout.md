# Safe-area for checkout sheets

The Razorpay sheet itself (web modal + native plugin) handles its own insets. This reference only applies when **you** build a custom bottom sheet wrapping pricing / "Pay now" CTA on top of the Razorpay flow.

## Required meta (already set in `index.html`)

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

## Tailwind classes for a payment sheet / sticky CTA

```tsx
<div className="fixed inset-x-0 bottom-0 bg-background border-t
                px-4 pt-4
                pb-[calc(env(safe-area-inset-bottom)+1rem)]">
  <Button className="w-full h-12" onClick={startPayment}>
    Pay ₹{price}
  </Button>
</div>
```

## Header above checkout

```tsx
<header className="sticky top-0 bg-background
                   pt-[env(safe-area-inset-top)]
                   pl-[env(safe-area-inset-left)]
                   pr-[env(safe-area-inset-right)]">
  ...
</header>
```

## Keyboard handling

When the Razorpay form opens its keyboard, push the CTA above it on native:

```ts
import { Keyboard } from "@capacitor/keyboard";

Keyboard.addListener("keyboardWillShow", (info) => {
  document.documentElement.style.setProperty("--kb", `${info.keyboardHeight}px`);
});
Keyboard.addListener("keyboardWillHide", () => {
  document.documentElement.style.setProperty("--kb", "0px");
});
```

```css
.pay-cta { padding-bottom: calc(env(safe-area-inset-bottom) + var(--kb, 0px) + 1rem); }
```

See the project-wide `safe-area-handling` skill for the full primer.
