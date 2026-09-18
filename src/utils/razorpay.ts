import { reportError, addBreadcrumb } from "../lib/sentry";

interface RazorpayInstance {
  open: () => void;
  close?: () => void;
  on: (event: "payment.failed", handler: (response: { error?: RazorpayPaymentError }) => void) => void;
}

declare global {
  interface Window {
    Razorpay: new (options: Omit<RazorpayOptions, "onFailure">) => RazorpayInstance;
  }
}

export const RAZORPAY_SCRIPT_TIMEOUT_MS = 8000;

export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(loaded);
    };
    const timeoutId = window.setTimeout(() => {
      script.remove();
      finish(false);
    }, RAZORPAY_SCRIPT_TIMEOUT_MS);
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.body.appendChild(script);
  });
};

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
    /** `'upi'` opens the checkout directly on the UPI tab. */
    method?: string;
  };

  theme?: {
    color?: string;
  };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  callback_url?: string;
  redirect?: boolean;
  /** Enable/disable individual payment methods (UPI, card, netbanking...). */
  method?: Record<string, boolean>;
  /** Checkout display config — used to pin UPI to the top of the sheet. */
  config?: Record<string, unknown>;
  /** Called when Razorpay fires `payment.failed`. */
  onFailure?: (err: RazorpayPaymentError) => void;
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayPaymentError {
  code?: string;
  description?: string;
  source?: string;
  step?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Human-friendly copy for Razorpay's opaque error shapes. Razorpay often
 * returns `description: "undefined"` (literal string) with no user-visible
 * message — that's what triggered the customer-facing bug report. Map the
 * common (step, reason) combos to actionable messages instead.
 */
export function formatRazorpayError(
  err: RazorpayPaymentError | undefined | null,
): string {
  if (!err) return "Payment failed. Please try again.";
  const step = (err.step || "").toLowerCase();
  const reason = (err.reason || "").toLowerCase();
  const source = (err.source || "").toLowerCase();
  const code = (err.code || "").toUpperCase();
  // Normalize: trim whitespace and reject the literal string "undefined"
  // (case-insensitive) which Razorpay sometimes returns instead of a real
  // description. Prevents "undefined" leaking into the user-facing copy.
  const rawDesc = (err.description ?? "").toString().trim();
  const desc = rawDesc && rawDesc.toLowerCase() !== "undefined" ? rawDesc : "";

  if (step === "payment_authentication") {
    // Card/UPI OTP or 3DS challenge failed on the bank side. This is NOT
    // a merchant-side config issue — the order + key are valid or Razorpay
    // would have refused to open. The user needs to retry with a different
    // instrument or complete the OTP correctly.
    return (
      desc ||
      "Bank could not verify your payment (OTP / 3-D Secure). Please retry, or use UPI / a different card."
    );
  }
  if (reason === "payment_cancelled")
    return "Payment cancelled. No amount was charged.";
  if (reason === "network_error")
    return "Network dropped during payment. Check your connection and retry.";
  if (reason === "gateway_error")
    return "Your bank's gateway is down. Please retry in a minute or use a different method.";
  if (reason === "international_transaction_not_allowed")
    return "International cards are not supported for this course. Please use an Indian card or UPI.";
  if (reason === "invalid_otp")
    return "Wrong OTP. Please retry and enter the OTP from your bank SMS.";
  if (reason === "payment_timeout") return "Payment timed out. Please retry.";

  // Razorpay's most common opaque failure: BAD_REQUEST_ERROR with
  // `description: "undefined"` and no reason. Attributable to the customer
  // (source=customer) — usually a mistyped OTP / UPI PIN or an authorization
  // that the bank refused without a specific code.
  if (
    code === "BAD_REQUEST_ERROR" ||
    reason === "payment_error" ||
    source === "customer"
  ) {
    return (
      desc ||
      "Payment could not be completed. Please retry, or try UPI / a different card."
    );
  }

  return (
    desc ||
    `Payment failed (${err.reason || err.code || "unknown reason"}). Please try again.`
  );
}

export const openRazorpayCheckout = async (
  options: RazorpayOptions,
): Promise<void> => {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    addBreadcrumb("payment", "razorpay:sdk-load-failed", {
      order_id: options.order_id,
    });
    const err = new Error(
      "Payment screen load nahi hui. Internet check karke dobara try karein.",
    );
    reportError(err, { surface: "razorpay.load", order_id: options.order_id });
    throw err;
  }

  if (!window.Razorpay) {
    const err = new Error(
      "Razorpay SDK not available. Please try again or use a different browser.",
    );
    reportError(err, {
      surface: "razorpay.load",
      reason: "sdk-missing-after-load",
      order_id: options.order_id,
    });
    throw err;
  }

  const { onFailure, ...rzpOptions } = options;
  const rzp = new window.Razorpay(rzpOptions);

  // Route Razorpay's async payment.failed event to the caller so the UI can
  // show a real message instead of a generic toast. Also forwarded to Sentry
  // with full context so we can diagnose recurring key/mode issues.
  rzp.on("payment.failed", (response: { error?: RazorpayPaymentError }) => {
    const err = response?.error;
    reportError(err ?? new Error("Razorpay payment failed"), {
      surface: "razorpay.payment_failed",
      step: err?.step,
      reason: err?.reason,
      code: err?.code,
      source: err?.source,
    });
    try {
      onFailure?.(err ?? {});
    } catch {
      /* ignore */
    }
  });

  addBreadcrumb("payment", "razorpay:open", {
    order_id: options.order_id,
    mode: "web",
  });
  rzp.open();

  // Blank-sheet guard. Inside the Android WebView the checkout iframe can fail
  // to render (blocked navigation, offline CDN) and `open()` reports nothing —
  // the user just watched "Processing…" flip back to the Pay button with an
  // empty gate. Verify the container actually mounted; if not, close and throw
  // so the caller can show a real message and offer another route.
  const mounted = await waitForCheckoutFrame();
  if (!mounted) {
    addBreadcrumb("payment", "razorpay:blank-sheet", {
      order_id: options.order_id,
    });
    try {
      rzp.close?.();
    } catch {
      /* ignore */
    }
    const err = new Error(
      "Payment screen khali reh gayi. App update karein ya website se pay karein.",
    );
    reportError(err, {
      surface: "razorpay.blank-sheet",
      order_id: options.order_id,
    });
    throw err;
  }
};

/** How long we allow the web checkout iframe to appear before calling it blank. */
export const CHECKOUT_FRAME_TIMEOUT_MS = 6000;

/** Resolves true once Razorpay's checkout container/iframe is in the DOM. */
async function waitForCheckoutFrame(): Promise<boolean> {
  const deadline = Date.now() + CHECKOUT_FRAME_TIMEOUT_MS;
  const present = () =>
    !!document.querySelector(
      '.razorpay-container, iframe[src*="razorpay"], iframe.razorpay-checkout-frame',
    );
  while (Date.now() < deadline) {
    if (present()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return present();
}

/**
 * UPI-first checkout config.
 *
 * Razorpay Checkout sirf wahi methods dikhata hai jo dashboard me enable hain.
 * Agar UPI dashboard me ON hai lekin block me neeche chhup jaata hai, ye config
 * UPI ko sabse upar pin kar deta hai (intent apps: GPay / PhonePe / Paytm).
 *
 * NOTE: agar Razorpay Dashboard → Settings → Payment Methods me UPI OFF hai
 * (ya account abhi under-review / non-KYC test mode me hai), to koi bhi client
 * config UPI ko force nahi kar sakta — wahan enable karna zaroori hai.
 */
export const UPI_FIRST_CHECKOUT_CONFIG = {
  method: {
    upi: true,
    card: true,
    netbanking: true,
    wallet: true,
    emi: false,
    paylater: false,
  },
  // Repeat buyers ko unka saved UPI ID "Recommended" me dikhta hai.
  remember_customer: true,
  config: {
    display: {
      blocks: {
        upi: {
          name: "Pay using UPI",
          // `intent` = installed app tiles (GPay / PhonePe / Paytm).
          // `collect` = VPA entry fallback jab koi UPI app installed na ho.
          // Dono explicit chahiye — sirf `{ method: 'upi' }` dene par
          // Razorpay generic block dikhata hai aur app tiles render nahi hote.
          instruments: [
            { method: "upi", flows: ["intent"] },
            { method: "upi", flows: ["collect"] },
          ],
        },
      },
      sequence: ["block.upi"],
      preferences: { show_default_blocks: true },
    },
  },
} as const;

/**
 * Razorpay `prefill.contact` ke liye Indian mobile number normalise karta hai.
 *
 * Razorpay ka "Recommended" / preferred-methods block poori tarah customer ke
 * contact number par banta hai — number na ho to checkout pehle contact-entry
 * screen dikhata hai aur recommended UPI apps render hi nahi hote.
 *
 * Galat number bhejne par Razorpay checkout error deta hai, isliye jo value
 * 10-digit Indian mobile me normalise na ho use hum omit kar dete hain.
 *
 * @returns 10-digit number, ya `undefined` agar input valid nahi hai.
 */
export const sanitizeRazorpayContact = (
  raw: string | null | undefined,
): string | undefined => {
  if (!raw) return undefined;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith("091"))
    digits = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith("0"))
    digits = digits.slice(1);
  if (digits.length !== 10) return undefined;
  if (!/^[6-9]/.test(digits)) return undefined;
  return digits;
};

/**
 * Prefill object banata hai. `contact` sirf tabhi include hota hai jab wo
 * valid ho, aur `method: 'upi'` checkout ko seedha UPI tab par kholta hai.
 */
export const buildRazorpayPrefill = (input: {
  name?: string | null;
  email?: string | null;
  contact?: string | null;
}): { name: string; email: string; contact?: string; method?: string } => {
  const contact = sanitizeRazorpayContact(input.contact);
  return {
    name: input.name || "",
    email: input.email || "",
    ...(contact ? { contact, method: "upi" } : {}),
  };
};
