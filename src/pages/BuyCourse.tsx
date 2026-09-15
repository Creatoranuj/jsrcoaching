import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import {
  CheckCircle, Shield, Loader2, CreditCard, Zap
} from "lucide-react";
import { useAdminEnrollment } from "../hooks/useAdminEnrollment";
import { openRazorpayCheckout, formatRazorpayError, buildRazorpayPrefill, UPI_FIRST_CHECKOUT_CONFIG, type RazorpaySuccessResponse } from "../utils/razorpay";
import { openNativeRazorpayCheckout, RazorpayCancelledError, RazorpayNativeError, RazorpayBridgeMissingError, RazorpayLaunchTimeoutError } from "../utils/razorpayNative";
import { invokePaymentFunction, recoverEnrollment } from "../utils/paymentApi";
import { tapMedium, notifySuccess, notifyError } from "../lib/nativeChrome";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { resolveContentUrl } from "../lib/resolveContentUrl";
import { safeGet, safeSet, safeRemove } from "../lib/storage";
import { logger } from "@/lib/logger";
import successSound from "@/assets/success.mp3.asset.json";
import AccessCountdown from "../components/courses/AccessCountdown";


const MERCHANT_NAME = "JSR COACHING";
// Self-hosted via Lovable CDN — no third-party dependency, works offline
// with cached CDN response, and satisfies the app-wide "no unlisted external
// host" invariant (was pixabay.com which is not in network_security_config).
const SUCCESS_SOUND_URL = successSound.url;

const BuyCourse = () => {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("id");
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { adminEnroll, isAdmin, isEnrolling } = useAdminEnrollment();

  const [step, setStep] = useState<"details" | "razorpay-success">("details");
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);
  // Coarse progress for the CTA label: "preparing" = creating the Razorpay
  // order, "opening" = waiting for the payment sheet to appear. The button
  // stays locked across BOTH phases so an impatient double-tap can never
  // start a second checkout attempt.
  const [payPhase, setPayPhase] = useState<null | "preparing" | "opening">(null);
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adminAutoEnrolled, setAdminAutoEnrolled] = useState(false);
  // Apple IAP policy guard — true only inside the native iOS build.
  const [isIosNative, setIsIosNative] = useState(false);
  // True inside any native (Capacitor) build — used to hide dev-only chrome.
  const [isNative, setIsNative] = useState(false);
  // Set from the server-issued order response ('test' | 'live'). Surfaces a
  // visible badge so a test-mode gateway can never be mistaken for live.
  const [paymentMode, setPaymentMode] = useState<"test" | "live" | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (active) {
          setIsNative(Capacitor.isNativePlatform());
          setIsIosNative(Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios");
        }
      } catch {
        /* web build — never native */
      }
    })();
    return () => { active = false; };
  }, []);


  // Mount guard for navigate()-after-await. Without this, the 1500ms delayed
  // redirect after Razorpay verification fires on an unmounted component if
  // the user dismisses/closes mid-flow — produces a spurious navigation
  // and a setState-on-unmounted warning.
  const isMountedRef = useRef(true);
  const redirectTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);


  const handleFreeEnrollment = async (courseIdNum: number) => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseIdNum)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        toast.info("You're already enrolled in this course!", { id: "already-enrolled" });
        navigate(`/my-courses`);
        return;
      }

      const { error } = await supabase
        .from("enrollments")
        .upsert(
          { user_id: user.id, course_id: courseIdNum, status: "active" },
          { onConflict: "user_id,course_id", ignoreDuplicates: true }
        );

      if (error) throw error;

      playSuccessSound();
      toast.success("Free enrollment successful! Starting your course...");
      navigate(`/my-courses`);
    } catch (error: any) {
      logger.error("Free enrollment error:", error);
      toast.error("Failed to enroll. Please try again.");
    }
  };

  // Payment recovery: check for completed payments without enrollment
  useEffect(() => {
    const recoverPayment = async () => {
      if (!user || !courseId) return;
      try {
        // Check if already enrolled
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", Number(courseId))
          .eq("status", "active")
          .maybeSingle();

        if (enrollment) {
          toast.info("You're already enrolled in this course!", { id: "already-enrolled" });
          navigate(`/my-courses`);
          return;
        }

        // Check for completed payment without enrollment
        const { data: completedPayment } = await supabase
          .from("razorpay_payments")
          .select("id, razorpay_order_id")
          .eq("user_id", user.id)
          .eq("course_id", Number(courseId))
          .eq("status", "completed")
          .maybeSingle();

        if (completedPayment) {
          // Payment was completed but enrollment missing — recover via dedicated function
          toast.info("Recovering your enrollment from a previous payment...");
          try {
            const ok = (await recoverEnrollment(Number(courseId))) === "recovered";

            if (ok) {
              playSuccessSound();
              toast.success("🎉 Enrollment recovered! You are now enrolled.");
              navigate(`/my-courses`);
              return;
            }
          } catch (recoveryErr) {
            logger.error("Recovery via edge function failed:", recoveryErr);
          }
        }
      } catch (err) {
        logger.error("Payment recovery check error:", err);
      }
    };

    recoverPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, courseId]);

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      if (courseId) {
        try {
          const { data, error } = await supabase
            .from("courses")
            .select("*")
            .eq("id", Number(courseId))
            .single();

          if (!error && data) {
            const isFree = !data.price || data.price === 0;
            const [resolvedThumb, resolvedImage] = await Promise.all([
              resolveContentUrl(data.thumbnail_url),
              resolveContentUrl(data.image_url),
            ]);
            setCourse({
              id: data.id,
              title: data.title,
              description: data.description,
              grade: data.grade,
              price: data.price ?? 0,
              thumbnailUrl: resolvedThumb ?? data.thumbnail_url,
              imageUrl: resolvedImage ?? data.image_url,
            });


            if (isFree && user) {
              await handleFreeEnrollment(Number(courseId));
            }
          }
        } catch (err) {
          logger.error("Error fetching course:", err);
        }
      }
      setLoading(false);
    };
    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user?.id]);

  useEffect(() => {
    const handleAdminAutoEnroll = async () => {
      if (isAdmin && course && course.price > 0 && courseId && !adminAutoEnrolled) {
        setAdminAutoEnrolled(true);
        await adminEnroll(Number(courseId));
      }
    };
    if (!loading && course) {
      handleAdminAutoEnroll();
    }
  }, [isAdmin, course, courseId, loading, adminAutoEnrolled, adminEnroll]);

  const playSuccessSound = () => {
    try {
      const audio = new Audio(SUCCESS_SOUND_URL);
      audio.volume = 0.5;
      audio.play().catch(() => {}); // autoplay rejection is expected on first tap
    } catch (e) {
      logger.error("Audio error", e);
    }
  };

  // Stable per-(user,course,attempt-window) idempotency key. We persist it
  // so re-tries within the same checkout session reuse the same Razorpay
  // order instead of creating duplicates. A fresh key is minted only when
  // the user finishes or explicitly leaves and comes back hours later.
  const idemKeyFor = (uid: string, cid: string): string => {
    const k = `nb:idem:${uid}:${cid}`;
    let v = safeGet(k);
    if (!v) {
      v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      safeSet(k, v);
    }
    return v;
  };
  const clearIdemKey = (uid: string, cid: string) => {
    safeRemove(`nb:idem:${uid}:${cid}`);
    safeRemove(`nb:pendingOrder:${uid}:${cid}`);
  };

  /** Last-resort reconciliation: ask the server if a payment landed even
   *  though our client lost the response (timeout, app killed, etc). */
  const attemptReconcile = async (cid: number): Promise<boolean> =>
    (await recoverEnrollment(cid)) === "recovered";


  /**
   * @param opts.forceWeb  Native builds only: bypass the Razorpay Android SDK
   *   and use the JS checkout inside the WebView. Needed because Razorpay's
   *   **test mode** has no real UPI PSP handles, so the native sheet hides the
   *   UPI tab entirely while the web checkout still renders UPI (collect/VPA).
   */
  const handleRazorpayPayment = async (opts?: { forceWeb?: boolean; existingOrder?: any }) => {
    if (!user) {
      toast.error("Please login first");
      navigate("/login", { state: { from: location.pathname + location.search } });
      return;
    }

    // Apple App Store policy: digital course access sold inside an iOS app
    // must use In-App Purchase. Razorpay checkout is therefore blocked on the
    // iOS native build — users are pointed to the web store instead.
    // (Web/PWA and Android are unaffected.)
    if (isIosNative) {
      toast.info("Purchases aren't available in the iOS app. Please buy this course on our website, then sign in here to access it.");
      return;
    }

    // Re-entrancy guard: one tap === one payment attempt. Without this, every
    // extra tap while the sheet was still opening minted another Razorpay
    // order, which is how the orders table filled up with orphan rows.
    const isFallbackAttempt = Boolean(opts?.forceWeb && opts.existingOrder);
    if (isRazorpayLoading && !isFallbackAttempt) return;

    setIsRazorpayLoading(true);
    setPayPhase(opts?.forceWeb ? "opening" : "preparing");
    const idempotency_key = idemKeyFor(user.id, String(courseId));
    let orderData: any = opts?.existingOrder;
    try {
      if (!orderData) {
        orderData = await invokePaymentFunction<any>("create-razorpay-order", {
          course_id: Number(courseId),
          idempotency_key,
        });
      }
      setPaymentMode(orderData?.mode === "test" ? "test" : orderData?.mode === "live" ? "live" : null);
      logger.info("Razorpay order ready", {
        mode: orderData?.mode,
        reused: Boolean(orderData?.reused),
        platform: isNative ? "native" : "web",
      });
      // Persist so a killed app / cold start can recover later.
      safeSet(
        `nb:pendingOrder:${user.id}:${courseId}`,
        JSON.stringify({ order_id: orderData.order_id, ts: Date.now() })
      );
    } catch (error: any) {
      logger.error("Razorpay create-order error:", error);
      // On timeout, the order may still have been created server-side.
      if (error?.code === "TIMEOUT") {
        toast.info("Network slow — checking if your order went through...");
        if (await attemptReconcile(Number(courseId))) {
          playSuccessSound();
          toast.success("🎉 Enrollment recovered!");
          clearIdemKey(user.id, String(courseId));
          navigate(`/my-courses/${courseId}?payment=success`, { replace: true, state: { justPurchased: Number(courseId) } });
          setIsRazorpayLoading(false);
          setPayPhase(null);
          return;
        }
      }
      toast.error(error?.message || "Failed to initiate payment. Please try again.");
      setIsRazorpayLoading(false);
      setPayPhase(null);
      return;
    }
    // NOTE: deliberately still locked. The button is released only once the
    // payment sheet has been dismissed, verified, or has failed to open.
    setPayPhase("opening");

    // Razorpay theme.color expects a hex string. Read the live --primary token
    // and convert HSL → hex so brand recolors flow through without a code edit.
    const primaryHex = (() => {
      try {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim();
        const [h, s, l] = raw.split(/\s+/).map((p) => parseFloat(p));
        if (!isFinite(h) || !isFinite(s) || !isFinite(l)) return "#F97316";
        const sN = s / 100, lN = l / 100;
        const c = (1 - Math.abs(2 * lN - 1)) * sN;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = lN - c / 2;
        const [r, g, b] = h < 60 ? [c, x, 0]
          : h < 120 ? [x, c, 0]
          : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c]
          : [c, 0, x];
        const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      } catch {
        return "#F97316";
      }
    })();

    const sharedOpts = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: MERCHANT_NAME,
      description: orderData.course_title,
      order_id: orderData.order_id,
      prefill: buildRazorpayPrefill({
        name: user.fullName,
        email: user.email,
        contact: profile?.mobile,
      }),
      theme: { color: primaryHex },
      ...UPI_FIRST_CHECKOUT_CONFIG,
    };

    // Native Capacitor (Android/iOS) → open native Razorpay SDK so UPI
    // intents launch Google Pay / PhonePe / Paytm directly without an
    // in-app browser. Web → fall back to the JS checkout.
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform() && !opts?.forceWeb) {
      try {
        void tapMedium();
        const resp = await openNativeRazorpayCheckout(sharedOpts);
        await verifyRazorpayPayment(resp);
      } catch (e: any) {
        if (e instanceof RazorpayBridgeMissingError) {
          // Old APK without the native bridge — silently use the in-app web
          // checkout instead of dead-ending the purchase.
          logger.warn("Native Razorpay bridge missing — falling back to web checkout");
          await handleRazorpayPayment({ forceWeb: true, existingOrder: orderData });
          return;
        }
        if (e instanceof RazorpayLaunchTimeoutError) {
          // The native sheet never appeared. Instead of dead-ending the
          // purchase with an "update the app" message, silently retry through
          // the in-app web checkout so the user can always pay.
          logger.warn("Native Razorpay sheet did not open — falling back to web checkout");
          toast.info("Payment screen khul nahi payi — browser checkout se khol rahe hain…");
          await handleRazorpayPayment({ forceWeb: true, existingOrder: orderData });
          return;
        } else if (e instanceof RazorpayCancelledError) {
          toast.info("Payment cancelled. You can try again whenever you're ready.");
        } else if (e instanceof RazorpayNativeError) {
          // Structured Razorpay failure — pass fields straight through so the
          // formatter renders the actionable message for payment_authentication
          // / BAD_REQUEST_ERROR / bank-side rejections.
          void notifyError();
          toast.error(formatRazorpayError({
            code: e.code, description: e.description, source: e.source,
            step: e.step, reason: e.reason, metadata: e.metadata,
          }) + " If your money was deducted, enrollment will happen automatically.");
        } else {
          void notifyError();
          toast.error(formatRazorpayError({ description: e?.message })
            + " If your money was deducted, enrollment will happen automatically.");
        }
      } finally {
        // Defense-in-depth: never leave the CTA stuck in "Processing…" if any
        // branch above threw synchronously after we cleared the initial spinner.
        if (isMountedRef.current) { setIsRazorpayLoading(false); setPayPhase(null); }
      }
      return;
    }

    try {
      await openRazorpayCheckout({
        ...sharedOpts,
        handler: async (response: RazorpaySuccessResponse) => {
          try {
            await verifyRazorpayPayment(response);
          } catch (err) {
            logger.error("Handler error:", err);
            toast.error("Payment safe hai — enrollment 2 minute me automatic ho jayega. Baad me refresh karo.");
          }
        },
        onFailure: (err) => {
          // Surface Razorpay's real reason instead of the generic
          // "Payment failed" toast that hid the underlying bank/OTP error.
          void notifyError();
          toast.error(formatRazorpayError(err));
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled. You can try again whenever you're ready.");
          },
        },
      });
    } catch (error: any) {
      logger.error("Razorpay open error:", error);
      toast.error(error?.message || "Failed to open checkout. Please try again.");
    } finally {
      if (isMountedRef.current) { setIsRazorpayLoading(false); setPayPhase(null); }
    }
  };

  /**
   * Rich "enrolled" toast — keeps user traction right after payment by
   * showing what they unlocked plus a live access-expiry countdown.
   */
  const showEnrollmentToast = () => {
    toast.success("🎉 Payment successful — you're enrolled!", {
      duration: 6000,
      description: (
        <div className="mt-1 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {course?.title ? `${course.title} unlocked.` : "Course unlocked."} Taking you to My Courses…
          </p>
          <AccessCountdown endDate={course?.end_date ?? null} size="sm" />
        </div>
      ),
    });
  };

  const verifyRazorpayPayment = async (response: RazorpaySuccessResponse) => {
    try {
      await invokePaymentFunction("verify-razorpay-payment", {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
        course_id: Number(courseId),
      });

      playSuccessSound();
      void notifySuccess();
      showEnrollmentToast();
      setStep("razorpay-success");
      if (user && courseId) clearIdemKey(user.id, String(courseId));
      redirectTimerRef.current = window.setTimeout(() => {
        if (isMountedRef.current) navigate(`/my-courses/${courseId}?payment=success`, { replace: true, state: { justPurchased: Number(courseId) } });
      }, 1500);

    } catch (error: any) {
      logger.error("Verification error:", error);
      const unreachable =
        error?.message === "razorpay_unreachable" || error?.status === 503;
      // Verification timed out / 5xx / Razorpay unreachable but the money is
      // very likely captured — reconcile before showing any failure.
      if (error?.code === "TIMEOUT" || unreachable || (error?.status && error.status >= 500)) {
        toast.info("Confirming with server...");
        // One explicit retry with a short backoff — the webhook may still be
        // in flight when the first reconcile runs.
        let recovered = await attemptReconcile(Number(courseId));
        if (!recovered) {
          await new Promise((r) => setTimeout(r, 2500));
          recovered = await attemptReconcile(Number(courseId));
        }
        if (recovered) {
          playSuccessSound();
          void notifySuccess();
          showEnrollmentToast();
          if (user && courseId) clearIdemKey(user.id, String(courseId));
          navigate(`/my-courses/${courseId}?payment=success`, { replace: true, state: { justPurchased: Number(courseId) } });
          return;
        }
        void notifyError();
        toast.error(
          "We couldn't confirm your payment right now. If your money was deducted, enrollment will happen automatically via webhook — please check My Courses in a few minutes."
        );
        return;
      }
      void notifyError();
      toast.error(error.message || "Payment verification failed. Please contact support.");
    }
  };


  if (loading) return <LoadingSpinner fullPage text="Loading course…" />;
  if (!course) return <div className="p-10 text-center">Course not found <Button onClick={() => navigate("/courses")}>Back</Button></div>;

  return (
    <div className="min-h-dvh bg-muted/30 pb-10">
      <header
        className="sticky top-0 z-50 bg-card border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3 shadow-sm"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >

        {step !== 'razorpay-success' && (
          <BackButton fallback="/courses" />
        )}
        <h1 className="font-semibold text-lg">Secure Checkout</h1>
        {paymentMode === "test" && !isNative && (
          <span className="ml-auto rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
            Test mode
          </span>
        )}
      </header>

      <main className="max-w-xl mx-auto p-4 mt-4">

        {/* ── STEP: Details ── */}
        {step === "details" && (
          <div className="space-y-4">
            {/* ── Order summary ── */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {course.price === 0 ? "Free Enrollment" : "Order Summary"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 items-center rounded-xl border bg-muted/40 p-3">
                  {course.imageUrl && (
                    <img
                      src={course.imageUrl}
                      alt={course.title}
                      loading="lazy"
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{course.title}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Lifetime access · Full course</p>
                  </div>
                </div>

                {course.price > 0 && (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Course fee</dt>
                      <dd className="font-medium">₹{course.price}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Taxes &amp; fees</dt>
                      <dd className="font-medium">₹0</dd>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex items-baseline justify-between">
                      <dt className="font-semibold">Total payable</dt>
                      <dd className="text-2xl font-bold text-primary">₹{course.price}</dd>
                    </div>
                  </dl>
                )}
              </CardContent>
            </Card>

            {course.price === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <Button
                    className="h-12 w-full text-base"
                    onClick={async () => {
                      if (!user) {
                        toast.error("Please login first");
                        navigate("/login", { state: { from: location.pathname + location.search } });
                        return;
                      }
                      await handleFreeEnrollment(Number(courseId));
                    }}
                    disabled={loading}
                  >
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Enroll for Free
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* ── Payment method ── */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Payment Method</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">Razorpay Secure</p>
                        <p className="text-xs text-muted-foreground">
                          UPI · Cards · Netbanking · Wallets
                        </p>
                      </div>
                      <CheckCircle className="h-5 w-5 shrink-0 text-primary" />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {["UPI / GPay", "PhonePe", "Paytm", "Visa · RuPay", "Netbanking"].map((m) => (
                        <span
                          key={m}
                          className="rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                        >
                          {m}
                        </span>
                      ))}
                    </div>

                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        Instant enrollment right after payment
                      </li>
                      <li className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        256-bit SSL · PCI DSS compliant checkout
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <p className="px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
                  By continuing you agree to our Terms &amp; Refund Policy. Payments are
                  processed securely by Razorpay — we never store your card details.
                </p>

                {/* ── Sticky pay bar ── */}
                <div
                  className="sticky bottom-0 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-lg font-bold">₹{course.price}</span>
                  </div>
                  {isIosNative ? (
                    <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-center text-sm text-muted-foreground">
                      Purchases aren't available in the iOS app. Buy this course on our
                      website, then sign in here to access it.
                    </div>
                  ) : (
                    <Button
                      onClick={() => { void handleRazorpayPayment(); }}
                      disabled={isRazorpayLoading}
                      className="h-12 w-full text-base font-semibold"
                    >
                      {isRazorpayLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          {payPhase === "opening" ? "Opening payment…" : "Preparing…"}
                        </>
                      ) : (
                        <>
                          <Shield className="mr-2 h-4 w-4" />
                          Pay ₹{course.price} Securely
                        </>
                      )}
                    </Button>
                  )}
                  {isNative && !isIosNative && (
                    <button
                      type="button"
                      onClick={() => { void tapMedium(); void handleRazorpayPayment({ forceWeb: true }); }}
                      disabled={isRazorpayLoading}
                      className="mt-2 w-full rounded-md py-2 text-xs font-medium text-muted-foreground underline-offset-4 transition-transform duration-150 ease-out active:scale-[0.97] active:opacity-90 disabled:opacity-50"
                    >
                      UPI option nahi dikh raha? Browser checkout se pay karein
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Razorpay Success ── */}
        {step === "razorpay-success" && (
          <Card className="text-center py-16 animate-in fade-in duration-500">
            <CardContent>
              <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-16 h-16" />
              </div>

              <h2 className="text-3xl font-bold mb-2 text-green-700">Payment Successful!</h2>
              <p className="text-muted-foreground mb-4">You are now enrolled in <strong>{course.title}</strong></p>

              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800 max-w-xs mx-auto my-6">
                <p className="text-sm text-green-700 dark:text-green-400">Amount Paid</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">₹{course.price}</p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1 flex items-center justify-center gap-1">
                  <Zap className="h-3 w-3" /> Instant enrollment activated
                </p>
              </div>

              <p className="text-muted-foreground text-sm mb-6">Redirecting you to your course...</p>

              <Button onClick={() => navigate('/my-courses')} className="w-full max-w-xs bg-green-600 hover:bg-green-700">
                Go to My Courses 🎉
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default BuyCourse;
