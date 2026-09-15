# Web checkout reference

Source: `src/utils/razorpay.ts`. Use on web/PWA only.

## Pattern

```ts
import { openRazorpayCheckout } from "@/utils/razorpay";
import { supabase } from "@/integrations/supabase/client";

const { data: order } = await supabase.functions.invoke("create-razorpay-order", {
  body: { course_id },
});

await openRazorpayCheckout({
  key: order.key_id,              // from server, NOT a frontend env
  amount: order.amount,           // paise, integer
  currency: "INR",
  name: "Naveen Bharat",
  description: order.description,
  order_id: order.order_id,
  prefill: { name: user.full_name, email: user.email, contact: user.mobile },
  theme: { color: "#hsl-primary" },
  handler: async (resp) => {
    // resp = { razorpay_payment_id, razorpay_order_id, razorpay_signature }
    // ALWAYS verify on server. Never trust this payload alone.
    await fetch(`${SUPABASE_URL}/functions/v1/verify-razorpay-payment`, { ... });
  },
  modal: {
    ondismiss: () => toast.info("Payment cancelled. Try again anytime."),
  },
});
```

## Gotchas

- `loadRazorpayScript()` is idempotent — safe to call repeatedly.
- The script is loaded from `https://checkout.razorpay.com/v1/checkout.js`. On strict CSP, allow that origin.
- `payment.failed` listener is already wired in `openRazorpayCheckout` — it console.errors; surface a toast in the caller if needed.
- For redirect mode (PWA fallback): set `callback_url` to `${origin}/payment-callback?course_id=...` and `redirect: true`. The `PaymentCallback` page handles verification.
- Never call this on native — UPI intents to PhonePe / GPay won't fire from a WebView.
