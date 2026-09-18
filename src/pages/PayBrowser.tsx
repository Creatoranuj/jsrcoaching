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
  UPI_FIRST_CHECKOUT_CONFIG,
} from "@/utils/razorpay";
import { APP_SCHEME } from "@/config/deepLinks";
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

  /** Send the user back into the app. Works from a Custom Tab on Android. */
  const backToApp = useCallback(
    (status: "success" | "cancelled") => {
      const url = `${APP_SCHEME}://payment-callback?payment=${status}${
        courseId ? `&course=${encodeURIComponent(courseId)}` : ""
      }${orderId ? `&order=${encodeURIComponent(orderId)}` : ""}`;
      try {
        window.location.href = url;
      } catch {
        /* user can close the tab manually */
      }
    },
    [courseId, orderId]
  );

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
        prefill: {
          name: params.get("n") || undefined,
          email: params.get("e") || undefined,
          contact: params.get("p") || undefined,
        },
        theme: { color: "#F97316" },
        ...UPI_FIRST_CHECKOUT_CONFIG,
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
        <p className="text-sm text-muted-foreground">
          Payment ho gaya. App me wapas jaa rahe hain&#8230; agar apne aap na khule to app
          kholkar My Courses check karein.
        </p>
      )}

      {message && (
        <p className="whitespace-normal break-words text-sm text-muted-foreground">{message}</p>
      )}

      {(phase === "cancelled" || phase === "error") && (
        <div className="flex w-full flex-col gap-2">
          <Button
            className="h-auto min-h-11 w-full whitespace-normal break-words leading-snug"
            onClick={() => {
              startedRef.current = true;
              void start();
            }}
          >
            Dobara koshish karein
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-11 w-full whitespace-normal break-words leading-snug"
            onClick={() => backToApp("cancelled")}
          >
            <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
            App me wapas jayein
          </Button>
        </div>
      )}
    </div>
  );
};

export default PayBrowser;
