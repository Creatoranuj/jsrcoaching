import { useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/sentry";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { notifySuccess, notifyError, tapLight } from "../lib/nativeChrome";
import { getErrorMessage } from "@/lib/errorMessage";
import { recoverEnrollment } from "../utils/paymentApi";
import {
  PAYMENT_RETURN_PARAMS,
  RETURN_POLL_INTERVAL_MS,
  RETURN_MAX_POLLS,
} from "@/config/paymentReturn";

type Status = "verifying" | "syncing" | "success" | "failed" | "cancelled" | "pending";

const PaymentCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  // AuthContext emits the `user` object twice on cold start (default → enriched).
  // Without this guard we'd fire the verification Edge Function twice and risk
  // duplicate enrollment rows / confusing UI flicker.
  const verifiedRef = useRef(false);

  // Course id comes either from the web redirect (`course_id`) or from the
  // browser-return deep link (`course`).
  const courseId =
    searchParams.get("course_id") ?? searchParams.get(PAYMENT_RETURN_PARAMS.course);

  useEffect(() => {
    if (!user || verifiedRef.current) return;
    verifiedRef.current = true;
    let redirectTimer: number | null = null;
    let cancelled = false;

    // Land the student directly on the course they just bought, not on a
    // generic list they then have to search through.
    const coursesPath = (courseIdNum: number | null) =>
      courseIdNum ? `/my-courses/${courseIdNum}?payment=success` : "/my-courses";

    const goToCourses = (courseIdNum: number | null) => {
      redirectTimer = window.setTimeout(() => {
        navigate(coursesPath(courseIdNum), {
          replace: true,
          state: courseIdNum ? { justPurchased: courseIdNum } : undefined,
        });
      }, 1500);
    };

    const succeed = (courseIdNum: number | null) => {
      if (cancelled) return;
      setStatus("success");
      void notifySuccess();
      toast.success("🎉 Payment verified! You are now enrolled!");
      goToCourses(courseIdNum);
    };

    /**
     * Student paid in the phone's real browser (`/pay` in a Custom Tab) and the
     * deep link brought them back. That tab has NO Supabase session, so there
     * is nothing to verify here — `razorpay-webhook` grants the enrollment
     * server-side. We simply wait for it via the idempotent
     * `recover-enrollment` function (same ~45s window as `usePaymentSync`) and
     * never show an error while the payment may still be settling.
     */
    const waitForWebhook = async (courseIdNum: number) => {
      setStatus("syncing");
      for (let attempt = 0; attempt < RETURN_MAX_POLLS; attempt++) {
        if (cancelled) return;
        const outcome = await recoverEnrollment(courseIdNum);
        if (outcome === "recovered") {
          succeed(courseIdNum);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, RETURN_POLL_INTERVAL_MS));
      }
      if (cancelled) return;
      // Not an error: the webhook can land a little later. Keep the copy calm.
      setStatus("pending");
    };

    const run = async () => {
      const returnStatus = searchParams.get(PAYMENT_RETURN_PARAMS.status);

      // ── Browser-return path (Custom Tab → deep link) ──
      if (returnStatus === "cancelled") {
        if (cancelled) return;
        setStatus("cancelled");
        return;
      }
      if (returnStatus === "success") {
        const courseIdNum = Number(courseId);
        if (!Number.isFinite(courseIdNum) || courseIdNum <= 0) {
          if (cancelled) return;
          setStatus("pending");
          return;
        }
        await waitForWebhook(courseIdNum);
        return;
      }

      // ── Web redirect path (Razorpay callback_url with signed fields) ──
      const razorpay_payment_id = searchParams.get("razorpay_payment_id");
      const razorpay_order_id = searchParams.get("razorpay_order_id");
      const razorpay_signature = searchParams.get("razorpay_signature");
      const course_id = searchParams.get("course_id");

      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !course_id) {
        if (cancelled) return;
        setStatus("failed");
        setErrorMsg(
          "Missing payment details. If you were charged, your enrollment will be processed automatically."
        );
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-razorpay-payment", {
          body: {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            course_id: Number(course_id),
          },
        });

        const unreachable =
          data?.error === "razorpay_unreachable" || (error?.message || "").includes("503");

        if (unreachable) {
          // Razorpay API was temporarily unreachable — the payment is very
          // likely captured. Try the reconciliation function once before
          // showing anything scary.
          const { data: rec } = await supabase.functions.invoke("recover-enrollment", {
            body: { course_id: Number(course_id) },
          });
          if (rec && !rec.error) {
            succeed(Number(course_id));
            return;
          }
          throw new Error(
            "We couldn't reach Razorpay to confirm right now. If payment was captured, enrollment will happen automatically via webhook — check My Courses in a few minutes."
          );
        }

        if (error) throw new Error(error.message || "Verification failed");
        if (data?.error) throw new Error(data.error);

        succeed(Number(course_id));
      } catch (err: unknown) {
        reportError(err, { surface: "PaymentCallback.verify" });
        if (cancelled) return;
        setStatus("failed");
        void notifyError();
        setErrorMsg(
          getErrorMessage(err) ||
            "Verification failed. Don't worry — if payment was captured, enrollment will happen automatically."
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (redirectTimer !== null) window.clearTimeout(redirectTimer);
    };
  }, [user, searchParams, navigate, courseId]);

  return (
    <main className="min-h-dvh bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          {status === "verifying" && (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <h2 className="text-xl font-bold">Verifying Payment...</h2>
              <p className="text-muted-foreground text-sm">
                Payment confirm ho raha hai — page band mat karo.
              </p>
            </>
          )}

          {status === "syncing" && (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <h2 className="text-xl font-bold">Payment mil gaya</h2>
              <p className="text-muted-foreground text-sm">
                Enrollment confirm ho raha hai — aap app band bhi kar sakte hain, access apne
                aap mil jayega.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold text-green-700">Payment Successful!</h2>
              <p className="text-muted-foreground">
                You are now enrolled. Redirecting to your course...
              </p>
              <div className="pb-[max(env(safe-area-inset-bottom),16px)]">
                <Button
                  onClick={() => { void tapLight(); navigate("/my-courses", { replace: true }); }}
                  className="w-full bg-green-600 hover:bg-green-700 active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Go to My Courses 🎉
                </Button>
              </div>
            </>
          )}

          {status === "pending" && (
            <>
              <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-12 h-12" />
              </div>
              <h2 className="text-xl font-bold">Enrollment confirm ho raha hai</h2>
              <p className="text-muted-foreground text-sm">
                Aapka payment mil gaya hai. Thodi der me My Courses me course dikh jayega —
                kuch dobara pay karne ki zarurat nahi hai.
              </p>
              <div className="space-y-2 pb-[max(env(safe-area-inset-bottom),16px)]">
                <Button
                  onClick={() => { void tapLight(); navigate("/my-courses", { replace: true }); }}
                  className="w-full active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Check My Courses
                </Button>
              </div>
            </>
          )}

          {status === "cancelled" && (
            <>
              <div className="w-20 h-20 bg-muted text-muted-foreground rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-12 h-12" />
              </div>
              <h2 className="text-xl font-bold">Payment cancel ho gaya</h2>
              <p className="text-muted-foreground text-sm">
                Aapse koi paisa nahi liya gaya. Jab chahein dobara koshish kar sakte hain.
              </p>
              <div className="space-y-2 pb-[max(env(safe-area-inset-bottom),16px)]">
                <Button
                  onClick={() => { void tapLight(); navigate(`/buy-course?id=${courseId ?? ""}`, { replace: true }); }}
                  className="w-full active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Dobara koshish karein
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { void tapLight(); navigate("/my-courses", { replace: true }); }}
                  className="w-full active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Check My Courses
                </Button>
              </div>
            </>
          )}

          {status === "failed" && (
            <>
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold text-red-700">Verification Issue</h2>
              <p className="text-muted-foreground text-sm">{errorMsg}</p>
              <div className="space-y-2 pb-[max(env(safe-area-inset-bottom),16px)]">
                <Button
                  onClick={() => { void tapLight(); navigate(`/buy-course?id=${courseId ?? ""}`, { replace: true }); }}
                  className="w-full active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Go Back to Course
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { void tapLight(); navigate("/my-courses", { replace: true }); }}
                  className="w-full active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Check My Courses
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default PaymentCallback;
