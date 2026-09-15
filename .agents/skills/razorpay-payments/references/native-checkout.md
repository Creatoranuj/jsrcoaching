# Native checkout reference (Capacitor Android)

Source: `src/utils/razorpayNative.ts`. Plugin: `capacitor-razorpay`.

## Why the native plugin (not the JS SDK)

The web JS SDK runs inside the WebView. UPI intent links (`upi://pay?...`) opened from a WebView in Capacitor are unreliable — PhonePe / GPay / Paytm may not launch. The native plugin opens the **Android Razorpay SDK** directly, which has proper intent handling.

## Pattern

```ts
import { Capacitor } from "@capacitor/core";
import { openNativeRazorpayCheckout } from "@/utils/razorpayNative";
import { openRazorpayCheckout } from "@/utils/razorpay";

const order = await invokeCreateOrder(...);

if (Capacitor.isNativePlatform()) {
  const resp = await openNativeRazorpayCheckout({
    key: order.key_id,
    amount: order.amount,        // number (will be cast to string internally)
    currency: "INR",
    name: "Naveen Bharat",
    description: order.description,
    order_id: order.order_id,
    prefill,
    theme: { color: "#hsl-primary" },
  });
  await verifyOnServer(resp); // verify-razorpay-payment edge fn
} else {
  await openRazorpayCheckout({ ...order, handler: verifyOnServer });
}
```

## Plugin quirks

- **Amount must be a string of paise** when passed to the plugin (the wrapper does `String(amount)` for you).
- **Response shape varies by plugin version.** The wrapper handles three cases:
  1. `{ response: { razorpay_payment_id, razorpay_order_id, razorpay_signature } }` (object)
  2. `{ response: "<json string>" }` — parsed
  3. Bare string payment id — wrapped as `{ razorpay_payment_id }` (signature missing; server will reject and webhook will save the enrollment)
- User cancellation throws — catch and show a neutral toast, never an error toast.

## Install / sync

```bash
npm install capacitor-razorpay
npx cap sync android
```

Already installed in this project — don't re-add. After any native config change, the user must run `npx cap sync` locally; the Lovable sandbox does not execute that.

## Deep-link not needed for normal native flow

The plugin resolves synchronously when the user finishes payment in the native sheet. Deep links are only needed if you implement a UPI collect flow that leaves the app. See `deep-link-return.md`.
