import { useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/sentry";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { notifySuccess, notifyError } from "../lib/nativeChrome";
import { getErrorMessage } from "@/lib/errorMessage";

const PaymentCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  // AuthContext emits the `user` object twice on cold start (default → enriched).
  // Without this guard we'd fire the verification Edge Function twice and risk
  // duplicate enrollment rows / confusing UI flicker.
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (!user || verifiedRef.current) return;
    verifiedRef.current = true;
    let redirectTimer: number | null = null;
    let cancelled = false;

    const verify = async () => {
      const razorpay_payment_id = searchParams.get("razorpay_payment_id");
      const razorpay_order_id = searchParams.get("razorpay_order_id");
      const razorpay_signature = searchParams.get("razorpay_signature");
      const course_id = searchParams.get("course_id");

      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !course_id) {
        if (cancelled) return;
        setStatus("failed");
        setErrorMsg("Missing payment details. If you were charged, your enrollment will be processed automatically.");
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
          data?.error === "razorpay_unreachable" ||
          (error?.message || "").includes("503");

        if (unreachable) {
          // Razorpay API was temporarily unreachable — the payment is very
          // likely captured. Try the reconciliation function once before
          // showing anything scary.
          const { data: rec } = await supabase.functions.invoke("recover-enrollment", {
            body: { course_id: Number(course_id) },
          });
          if (rec && !rec.error) {
            if (cancelled) return;
            setStatus("success");
            void notifySuccess();
            toast.success("🎉 Payment verified! You are now enrolled!");
            redirectTimer = window.setTimeout(() => {
              navigate('/my-courses', { replace: true, state: { justPurchased: Number(course_id) } });
            }, 1500);
            return;
          }
          throw new Error(
            "We couldn't reach Razorpay to confirm right now. If payment was captured, enrollment will happen automatically via webhook — check My Courses in a few minutes."
          );
        }

        if (error) throw new Error(error.message || "Verification failed");
        if (data?.error) throw new Error(data.error);


        if (cancelled) return;
        setStatus("success");
        // Success haptic — heavy tactile confirmation on payment verify.
        void notifySuccess();
        toast.success("🎉 Payment verified! You are now enrolled!");

        redirectTimer = window.setTimeout(() => {
          navigate('/my-courses', { replace: true, state: { justPurchased: Number(course_id) } });
        }, 1500);
      } catch (err: unknown) {
        reportError(err, { surface: "PaymentCallback.verify" });
        if (cancelled) return;
        setStatus("failed");
        void notifyError();
        setErrorMsg(getErrorMessage(err) || "Verification failed. Don't worry — if payment was captured, enrollment will happen automatically.");
      }
    };

    verify();

    return () => {
      cancelled = true;
      if (redirectTimer !== null) window.clearTimeout(redirectTimer);
    };
  }, [user, searchParams, navigate]);

  const courseId = searchParams.get("course_id");

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

          {status === "success" && (
            <>
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold text-green-700">Payment Successful!</h2>
              <p className="text-muted-foreground">You are now enrolled. Redirecting to your course...</p>
              <div className="pb-[max(env(safe-area-inset-bottom),16px)]">
                <Button
                  onClick={() => navigate('/my-courses', { replace: true })}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  Go to My Courses 🎉
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
                  onClick={() => navigate(`/buy-course?id=${courseId}`, { replace: true })}
                  className="w-full"
                >
                  Go Back to Course
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/my-courses", { replace: true })}
                  className="w-full"
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
