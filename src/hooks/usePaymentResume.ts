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
 *
 * Immortality comes from three things:
 *   1. the reminder lives on the device for 24 h (`pendingPayment`),
 *   2. a rate-limit-aware schedule (`waitForEnrollment`) that actually spans
 *      ~5 minutes instead of dying against the 5-calls-per-minute limiter,
 *   3. a re-arm whenever the app comes back to the foreground, so every app
 *      open is another chance to reconcile.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { clearPendingPayment, readPendingPayment } from "@/lib/pendingPayment";
import { waitForEnrollment } from "@/utils/reconcileEnrollment";
import { buildPostEnrollmentPath, postEnrollmentState } from "@/config/paymentReturn";

const PaymentResume = (): null => {
  usePaymentResume();
  return null;
};

export const usePaymentResume = (): void => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const runningRef = useRef(false);
  // ONE poller at a time. These pages own the purchase while they are on
  // screen, each with its own dedicated UI:
  //   /payment-callback  → browser-UPI return screen (its own poll)
  //   /buy-course/*      → the settlement engine (verify + quick reconcile);
  //                        the in-app sheet backgrounds the app for the UPI
  //                        hop, and a resume poll firing on that foreground
  //                        would race the engine and burn the rate budget.
  //   /my-courses/:id?payment=success → usePaymentSync's syncing gate.
  // Two pollers double the calls (straight into the 5/60 s limiter) and fight
  // over the redirect.
  const onCallbackPage = pathname.startsWith("/payment-callback");
  const onBuyPage = pathname.startsWith("/buy-course");
  // Every confirmed purchase now lands on the My Courses LIST with
  // `?payment=success`, so the gate must cover the list itself as well as the
  // older detail URL — otherwise this hook starts a second poller on exactly
  // the screen that is already waiting for the same enrollment.
  const onSyncGate =
    pathname.startsWith("/my-courses") &&
    new URLSearchParams(search).get("payment") === "success";
  const anotherPollerOwnsIt = onCallbackPage || onBuyPage || onSyncGate;

  useEffect(() => {
    if (!isAuthenticated || anotherPollerOwnsIt) return;

    let cancelled = false;

    const attemptResume = async () => {
      if (cancelled || runningRef.current) return;
      const pending = readPendingPayment();
      if (!pending) return;

      runningRef.current = true;
      try {
        const result = await waitForEnrollment(pending.courseId, {
          isCancelled: () => cancelled,
          onFirstAttempt: () =>
            toast.loading(
              "Aapka payment mil gaya hai — enrollment confirm ho raha hai. Aap app band bhi kar sakte hain.",
              { id: "payment-resume", duration: 10000 },
            ),
        });

        if (cancelled) return;

        if (result === "recovered") {
          clearPendingPayment();
          toast.dismiss("payment-resume");
          toast.success("🎉 Course unlock ho gaya! Aapka access ab live hai.");
          navigate(buildPostEnrollmentPath(pending.courseId, "success"), {
            state: postEnrollmentState(pending.courseId),
          });
          return;
        }

        if (result === "not-yet") {
          // NOT an error — bank/UPI settlement can be slow. The reminder stays
          // on the device so the next app open tries again; the student must
          // never be tempted to pay twice.
          toast.dismiss("payment-resume");
          toast.info(
            "Thodi der lag rahi hai, par aapka paisa surakshit hai. Dobara pay mat karna — course apne aap My Courses me aa jayega.",
            { duration: 10000 },
          );
        }
      } finally {
        // Always release, so a later foreground/auth change can try again.
        // Leaving this latched was how one cancelled run killed resume for the
        // rest of the session.
        runningRef.current = false;
      }
    };

    void attemptResume();

    // Every return to the foreground is a fresh chance — the webhook may have
    // landed while the app was backgrounded.
    const onVisible = () => {
      if (document.visibilityState === "visible") void attemptResume();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      toast.dismiss("payment-resume");
    };
  }, [isAuthenticated, anotherPollerOwnsIt, navigate]);
};

export default PaymentResume;
