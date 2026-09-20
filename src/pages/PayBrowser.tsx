/**
 * `/pay` — standalone checkout page opened in the PHONE'S REAL BROWSER
 * (Android Custom Tab) by the Capacitor app when the native Razorpay sheet
 * cannot open.
 *
 * WHY THIS EXISTS
 * Razorpay's JS checkout hides the UPI *intent* tiles (GPay / PhonePe /
 * Paytm) whenever it runs inside an Android WebView, because a WebView cannot
 * launch another app via an `intent://` URL. The old in-app web fallback
 * therefore produced a checkout with cards + netbanking only. In a Custom Tab
 * the same checkout is a real browser, so UPI apps show up again.
 *
 * SECURITY: every value in the query string is public by design — the order
 * id and `key_id` are what Razorpay's own checkout embeds in any web page.
 * Nothing here can grant enrollment: `razorpay-webhook` (server side,
 * signature verified) is the source of truth and the app reconciles on resume.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import {
  openRazorpayCheckout,
  formatRazorpayError,
  buildUpiCheckoutConfig,
  buildRazorpayPrefill,
} from "@/utils/razorpay";
// Return-link shape lives in one place so PaymentCallback always reads the
// same param names this page writes. Do NOT hand-build the deep link here.
import {
  buildPaymentReturnUrl,
  buildPaymentReturnIntentUrl,
  buildPaymentReturnWebUrl,
  RETURN_HANDOFF_STEP_MS,
} from "@/config/paymentReturn";
import { reportError, addBreadcrumb } from "@/lib/sentry";

type Phase = "opening" | "open" | "done" | "cancelled" | "error";

const PayBrowser = () => {
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("opening");
  const [message, setMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  const orderId = params.get("order") ?? "";
  const keyId = params.get("key") ?? "";
  const amountPaise = Number(params.get("amount") ?? "0");
  const currency = params.get("currency") || "INR";
  const title = params.get("title") || "Course";
  const courseId = params.get("course") || "";

  /**
   * Send the user back into the app from a Custom Tab.
   *
   * Two automatic hand-offs, in order, because neither alone is reliable:
   *   1. `intent://…;package=…;end` — the documented Android form; it is the
   *      one Chrome honours without a user gesture.
   *   2. `com.jsrcoaching.app://payment-callback` — the custom scheme, as a
   *      follow-up for browsers that prefer it.
   *   3. the verified https App Link — NEVER automatic (see below); reachable
   *      only through the visible button, as a real user gesture.
   *
   * Each hop is skipped once the tab goes hidden (the app took over). Timers
   * are tracked so unmount clears them — a stray timer firing after the tab
   * is reused would yank the student out of an unrelated page.
   */
  const handoffTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastStatusRef = useRef<"success" | "cancelled">("success");

  useEffect(() => () => {
    handoffTimersRef.current.forEach(clearTimeout);
    handoffTimersRef.current = [];
  }, []);

  const backToApp = useCallback(
    (status: "success" | "cancelled") => {
      lastStatusRef.current = status;
      handoffTimersRef.current.forEach(clearTimeout);
      handoffTimersRef.current = [];

      const opts = { courseId, orderId };
      // Order matters. `intent://` with an explicit package is the documented
      // Android hand-off and is the one Chrome honours most often, so it goes
      // first; the custom scheme is the follow-up.
      //
      // The https App Link is deliberately NOT fired automatically: when the
      // tab is already on that same host, Android reuses the tab instead of
      // opening the app, which strands a paying student on the website and
      // makes them log in a second time. It is only reachable through the
      // visible "App me wapas jayein" button below (a real user gesture).
      const hops = [
        buildPaymentReturnIntentUrl(status, opts),
        buildPaymentReturnUrl(status, opts),
      ];

      hops.forEach((url, i) => {
        const go = () => {
          // Tab already backgrounded → the app has focus, stop navigating.
          if (typeof document !== "undefined" && document.hidden) return;
          addBreadcrumb("payment", "browser-return:hop", { step: i, order_id: orderId });
          try {
            window.location.href = url;
          } catch {
            /* next hop, or the visible button, will carry the student back */
          }
        };
        if (i === 0) go();
        else handoffTimersRef.current.push(setTimeout(go, RETURN_HANDOFF_STEP_MS * i));
      });
    },
    [courseId, orderId]
  );

  /** Last resort, gesture-only: the verified https link. */
  const openWebFallback = useCallback(() => {
    addBreadcrumb("payment", "browser-return:web-fallback", { order_id: orderId });
    window.location.href = buildPaymentReturnWebUrl(lastStatusRef.current, {
      courseId,
      orderId,
    });
  }, [courseId, orderId]);

  const start = useCallback(async () => {
    if (!orderId || !keyId || !Number.isFinite(amountPaise) || amountPaise <= 0) {
      setPhase("error");
      setMessage("Payment link adhoora hai. App me wapas jaakar dobara koshish karein.");
      return;
    }
    setPhase("open");
    setMessage(null);
    addBreadcrumb("payment", "browser-checkout:open", { order_id: orderId });
    try {
      await openRazorpayCheckout({
        key: keyId,
        amount: amountPaise,
        currency,
        name: "JSR COACHING",
        description: title,
        order_id: orderId,
        prefill: buildRazorpayPrefill({
          name: params.get("n"),
          email: params.get("e"),
          contact: params.get("p"),
        }),
        theme: { color: "#F97316" },
        // Mode-aware layout. On a TEST key Razorpay has no UPI `intent`
        // instruments, so asking for them renders an empty UPI block and the
        // sheet looks "stuck"/broken. `buildUpiCheckoutConfig` asks for
        // `collect` only in test mode and both flows in live mode.
        ...buildUpiCheckoutConfig(keyId.startsWith("rzp_test_") ? "test" : "live"),
        handler: () => {
          // Enrollment is granted server-side by `razorpay-webhook`; the app
          // confirms it on resume. Nothing to verify from this page — it runs
          // in a plain browser tab with no Supabase session.
          setPhase("done");
          addBreadcrumb("payment", "browser-checkout:paid", { order_id: orderId });
          backToApp("success");
        },
        onFailure: (err) => {
          setPhase("error");
          setMessage(
            formatRazorpayError(err) +
              " Agar paisa kat gaya hai to enrollment webhook se apne aap ho jayega."
          );
        },
        modal: {
          ondismiss: () => {
            setPhase("cancelled");
          },
        },
      });
    } catch (err) {
      reportError(err, { surface: "PayBrowser" });
      setPhase("error");
      setMessage("Checkout khul nahi paya. Internet check karke dobara koshish karein.");
    }
  }, [amountPaise, backToApp, currency, keyId, orderId, params, title]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
  }, [start]);

  const rupees = amountPaise > 0 ? (amountPaise / 100).toFixed(2) : null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <h1 className="text-lg font-semibold leading-snug">{title}</h1>
      {rupees && (
        <p className="text-sm text-muted-foreground">Amount: &#8377;{rupees}</p>
      )}

      {(phase === "opening" || phase === "open") && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Payment window khul raha hai&#8230;
        </p>
      )}

      {phase === "done" && (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Payment ho gaya &#10003; Paisa surakshit hai &#8212; enrollment apne aap ho
            jayegi. App me wapas jaa rahe hain&#8230;
          </p>
          <Button
            className="h-auto min-h-12 w-full whitespace-normal break-words text-base leading-snug active:scale-[0.97] transition-transform duration-150 ease-out"
            onClick={() => backToApp("success")}
          >
            <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
            App me wapas jayein
          </Button>
          <button
            type="button"
            onClick={openWebFallback}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            App nahi khul raha? Website par kholein
          </button>
          <p className="text-xs text-muted-foreground">
            Aap app khud bhi khol sakte hain &#8212; course apne aap unlock ho jayega.
          </p>
        </div>
      )}

      {message && (
        <p className="whitespace-normal break-words text-sm text-muted-foreground">{message}</p>
      )}

      {(phase === "cancelled" || phase === "error") && (
        <div className="flex w-full flex-col gap-2">
          <Button
            className="h-auto min-h-11 w-full whitespace-normal break-words leading-snug active:scale-[0.97] transition-transform duration-150 ease-out"
            onClick={() => {
              startedRef.current = true;
              void start();
            }}
          >
            Dobara koshish karein
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-11 w-full whitespace-normal break-words leading-snug active:scale-[0.97] transition-transform duration-150 ease-out"
            onClick={() => backToApp("cancelled")}
          >
            <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
            App me wapas jayein
          </Button>
          <button
            type="button"
            onClick={openWebFallback}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            App nahi khul raha? Website par kholein
          </button>
          <p className="text-xs text-muted-foreground">
            Aap app khud bhi khol sakte hain &#8212; course apne aap unlock ho jayega.
          </p>
        </div>
      )}

      {orderId && (
        <p className="pt-2 text-[11px] text-muted-foreground">
          Order ref: <span className="font-mono">{orderId}</span>
        </p>
      )}
    </div>
  );
};

export default PayBrowser;
