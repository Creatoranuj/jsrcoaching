/**
 * Finishes a purchase that was interrupted — no matter how.
 *
 * The student can pay in the phone's real browser, close everything, kill the
 * app, and sign in two hours later from the login screen. The moment a
 * session exists on this device, this hook notices the remembered payment,
 * quietly asks the server whether the enrollment has landed (idempotent
 * `recover-enrollment`), and lands the student on the unlocked course with a
 * reassuring toast at every step.
 *
 * It NEVER grants access itself — the webhook does that, server side. This is
 * purely "keep checking and keep the student informed".
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { recoverEnrollment } from "@/utils/paymentApi";
import { clearPendingPayment, readPendingPayment } from "@/lib/pendingPayment";

/**
 * Backoff, in ms, between reconciliation attempts. Starts fast (the webhook
 * usually lands in a few seconds) and stretches to ~3.5 minutes so a slow
 * bank/UPI settlement is still caught without hammering the function.
 */
const BACKOFF_MS = [
  0, 3000, 3000, 5000, 5000, 8000, 10000, 15000, 20000, 30000, 30000, 45000, 60000,
];

const PaymentResume = (): null => {
  usePaymentResume();
  return null;
};

export const usePaymentResume = (): void => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const runningRef = useRef(false);
  // /payment-callback runs its own, faster poll with a dedicated screen.
  // Two pollers would double the calls and fight over the redirect.
  const onCallbackPage = pathname.startsWith("/payment-callback");

  useEffect(() => {
    if (!isAuthenticated || onCallbackPage || runningRef.current) return;
    const pending = readPendingPayment();
    if (!pending) return;

    runningRef.current = true;
    let cancelled = false;
    let syncingToastShown = false;

    const run = async () => {
      for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
        if (cancelled) return;
        if (BACKOFF_MS[attempt] > 0) {
          await new Promise((r) => window.setTimeout(r, BACKOFF_MS[attempt]));
        }
        if (cancelled) return;

        if (!syncingToastShown) {
          syncingToastShown = true;
          toast.loading(
            "Aapka payment mil gaya hai — enrollment confirm ho raha hai. Aap app band bhi kar sakte hain.",
            { id: "payment-resume", duration: 8000 },
          );
        }

        const outcome = await recoverEnrollment(pending.courseId);
        if (cancelled) return;

        if (outcome === "recovered") {
          clearPendingPayment();
          toast.dismiss("payment-resume");
          toast.success("🎉 Course unlock ho gaya! Aapka access ab live hai.");
          navigate(`/my-courses/${pending.courseId}?payment=success`, {
            replace: false,
            state: { justPurchased: pending.courseId },
          });
          return;
        }
      }

      if (cancelled) return;
      // Still not granted. This is NOT an error — Razorpay/bank settlement can
      // be slow. The reminder stays on the device so the next app open tries
      // again; the student must never be tempted to pay twice.
      toast.dismiss("payment-resume");
      toast.info(
        "Thodi der lag rahi hai, par aapka paisa surakshit hai. Dobara pay mat karna — course apne aap My Courses me aa jayega.",
        { duration: 10000 },
      );
      runningRef.current = false;
    };

    void run();

    return () => {
      cancelled = true;
      toast.dismiss("payment-resume");
    };
  }, [isAuthenticated, onCallbackPage, navigate]);
};

export default PaymentResume;
