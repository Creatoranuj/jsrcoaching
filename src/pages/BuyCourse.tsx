import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import {
  CheckCircle, Shield, Loader2, CreditCard, Zap, ExternalLink
} from "lucide-react";
import { useAdminEnrollment } from "../hooks/useAdminEnrollment";
import { openRazorpayCheckout, formatRazorpayError, buildRazorpayPrefill, buildUpiCheckoutConfig, type RazorpaySuccessResponse } from "../utils/razorpay";
import { openNativeRazorpayCheckout, type NativeCheckoutStep, RazorpayCancelledError, RazorpayNativeError, RazorpayBridgeMissingError, RazorpayLaunchTimeoutError, RazorpayInvalidResponseError, RazorpaySheetUnresponsiveError, describePayFailure } from "../utils/razorpayNative";
import { invokePaymentFunction, recoverEnrollment, PaymentApiError } from "../utils/paymentApi";
import { listUpiApps, type UpiApp } from "../utils/upiApps";
import { tapLight, tapMedium, notifySuccess, notifyError } from "../lib/nativeChrome";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { resolveContentUrl } from "../lib/resolveContentUrl";
import { safeGet, safeSet, safeRemove } from "../lib/storage";
import { rememberPendingPayment } from "../lib/pendingPayment";
import { logger } from "@/lib/logger";
import { loadBuildStamp, formatBuildStamp } from "@/lib/buildStamp";
import successSound from "@/assets/success.mp3.asset.json";
import AccessCountdown from "../components/courses/AccessCountdown";
import { APP_LINK_HOSTS } from "@/config/deepLinks";
import { useCourseAvailability } from "@/hooks/useCourseAvailability";


const MERCHANT_NAME = "JSR COACHING";

interface RazorpayOrderData {
  order_id: string;
  key_id: string;
  amount: number;
  currency?: string;
  course_title?: string;
  course_id?: number | string;
  mode?: "test" | "live";
  reused?: boolean;
}

interface CourseData {
  id: number;
  title: string;
  description: string | null;
  grade: number | null;
  price: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  end_date?: string | null;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof PaymentApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/**
 * Hand the checkout to the PHONE'S REAL BROWSER (Android Custom Tab).
 *
 * Razorpay's JS checkout detects an Android WebView and hides the UPI intent
 * tiles (GPay / PhonePe / Paytm) there, because a WebView cannot launch
 * another app. The old in-app web fallback therefore always rendered a
 * UPI-less checkout. Opening the SAME order in a Custom Tab restores UPI.
 *
 * The order is REUSED, never recreated — no double charge is possible.
 */
const openBrowserCheckout = async (
  orderData: RazorpayOrderData & { course_id?: number | string },
  prefill: { name?: string; email?: string; contact?: string }
): Promise<void> => {
  const q = new URLSearchParams({
    order: String(orderData.order_id),
    key: String(orderData.key_id),
    amount: String(orderData.amount),
    currency: String(orderData.currency || "INR"),
    title: String(orderData.course_title || "Course"),
    course: String(orderData.course_id ?? ""),
  });
  if (prefill.name) q.set("n", prefill.name);
  if (prefill.email) q.set("e", prefill.email);
  if (prefill.contact) q.set("p", prefill.contact);

  const origin = `https://${APP_LINK_HOSTS[0]}`;
  const { openExternal } = await import("@/lib/native/browser");
  // preferWebView:false → system browser (Custom Tab), NOT the embedded
  // WebView. That is the entire point of this fallback; do not change it.
  await openExternal(`${origin}/pay?${q.toString()}`, { preferWebView: false });
};

/**
 * Website escape hatch — opens the REAL site's buy page in the phone's
 * browser so the student can sign in with their own account and pay there.
 *
 * Preferred over the bare `/pay` tab whenever the in-app sheet cannot open:
 * the student sees a familiar logged-in page, UPI apps work (real browser,
 * not a WebView), and the purchase lands on the same account, so the course
 * appears in the app as soon as the webhook grants enrollment.
 */
const openWebsiteCheckout = async (courseId: string | number | null): Promise<void> => {
  const origin = `https://${APP_LINK_HOSTS[0]}`;
  const target = courseId ? `${origin}/buy-course?id=${encodeURIComponent(String(courseId))}` : origin;
  const { openExternal } = await import("@/lib/native/browser");
  try {
    await openExternal(target, { preferWebView: false });
    toast.info("Website khul gayi — wahan login karke UPI se payment poora karein.");
  } catch (err) {
    logger.error("Website checkout handoff failed:", err);
    toast.error("Website khul nahi payi. Internet check karke dobara koshish karein.");
  }
};
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
  // Batch Full gate. Display side only — `complete_paid_enrollment()` refuses
  // the enrollment server-side too, so a stale page cannot sneak a payment in.
  const { isFull: batchFull, seatLimit, seatsTaken } = useCourseAvailability(courseId);

  const [step, setStep] = useState<"details" | "razorpay-success">("details");
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);
  // Coarse progress for the CTA label: "preparing" = creating the Razorpay
  // order, "opening" = waiting for the payment sheet to appear. The button
  // stays locked across BOTH phases so an impatient double-tap can never
  // start a second checkout attempt.
  const [payPhase, setPayPhase] = useState<null | "preparing" | "opening">(null);
  // Exact sub-step of the checkout launch. Rendered as a tiny diagnostic line
  // so a stuck attempt can be reported from a screenshot instead of guessed at.
  const [payStep, setPayStep] = useState<null | "order" | "bridge" | "sheet" | "web" | "browser">(null);
  // Which checkout actually ran: the in-app native Razorpay SDK (UPI app tiles)
  // or the web checkout fallback (no UPI intents). Surfaced in the diagnostic
  // line so one screenshot tells us which path the device took.
  const [payMode, setPayMode] = useState<null | "native" | "web" | "browser">(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminAutoEnrolled, setAdminAutoEnrolled] = useState(false);
  // Apple IAP policy guard — true only inside the native iOS build.
  const [isIosNative, setIsIosNative] = useState(false);
  // True inside any native (Capacitor) build — used to hide dev-only chrome.
  const [isNative, setIsNative] = useState(false);
  // Set from the server-issued order response ('test' | 'live'). Surfaces a
  // visible badge so a test-mode gateway can never be mistaken for live.
  const [paymentMode, setPaymentMode] = useState<"test" | "live" | null>(null);
  // Which build is actually installed. Printed next to the checkout button so
  // a screenshot alone proves whether the fix is on the device.
  const [buildLabel, setBuildLabel] = useState<string | null>(null);
  // UPI apps actually installed on this phone (Android only). Shown as chips so
  // the student knows which app will open before tapping Pay, and so "no UPI
  // section" can be told apart from "no UPI app installed".
  const [upiApps, setUpiApps] = useState<UpiApp[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadBuildStamp().then((stamp) => {
      if (alive) setBuildLabel(formatBuildStamp(stamp));
    });
    return () => {
      alive = false;
    };
  }, []);

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

  // Probe installed UPI apps once we know we are inside the Android app.
  useEffect(() => {
    if (!isNative || isIosNative) return;
    let active = true;
    void listUpiApps().then((apps) => {
      if (active) setUpiApps(apps);
    });
    return () => { active = false; };
  }, [isNative, isIosNative]);


  // Mount guard for navigate()-after-await. Without this, the 1500ms delayed
  // redirect after Razorpay verification fires on an unmounted component if
  // the user dismisses/closes mid-flow — produces a spurious navigation
  // and a setState-on-unmounted warning.
  const isMountedRef = useRef(true);
  // One silent native retry per purchase attempt. A failed sheet launch must
  // retry IN THE APP — never hand the student off to a browser automatically.
  const nativeRetryRef = useRef(0);
  // The browser checkout is now an explicit, opt-in escape hatch that only
  // appears after in-app payment failed twice. Students must never be pushed
  // out of the app by default.
  const [showBrowserEscape, setShowBrowserEscape] = useState(false);
  /**
   * Last payment failure, kept verbatim for the on-screen diagnostics panel.
   * Without this a failed launch only ever produced a toast, so nobody could
   * tell WHY the sheet did not open.
   */
  const [payDiag, setPayDiag] = useState<string | null>(null);
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
    } catch (error: unknown) {
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
  const handleRazorpayPayment = async (opts?: { forceWeb?: boolean; existingOrder?: RazorpayOrderData }) => {
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
    // Any attempt that reuses an already-created order is a retry/fallback of
    // the current purchase, so it must be allowed through the re-entrancy guard
    // even though the CTA is still in its loading state.
    const isFallbackAttempt = Boolean(opts?.existingOrder);
    if (isRazorpayLoading && !isFallbackAttempt) return;

    setIsRazorpayLoading(true);
    setPayPhase(opts?.forceWeb ? "opening" : "preparing");
    setPayStep(opts?.forceWeb ? "web" : "order");
    setPayMode(opts?.forceWeb ? "web" : null);
    const idempotency_key = idemKeyFor(user.id, String(courseId));
    let orderData: RazorpayOrderData | undefined = opts?.existingOrder;
    try {
      if (!orderData) {
        orderData = await invokePaymentFunction<RazorpayOrderData>("create-razorpay-order", {
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
    } catch (error: unknown) {
      logger.error("Razorpay create-order error:", error);
      const apiError = error instanceof PaymentApiError ? error : undefined;
      // Server refused to create an order because this student already owns
      // the seat (or already paid for it). Never a failure for the user —
      // send them straight to the course instead of letting them pay twice.
      if (apiError?.code === "ALREADY_ENROLLED" || apiError?.code === "ALREADY_PAID") {
        toast.info(apiError.message);
        clearIdemKey(user.id, String(courseId));
        if (apiError.code === "ALREADY_PAID") void attemptReconcile(Number(courseId));
        navigate(`/my-courses/${courseId}?payment=success`, { replace: true, state: { justPurchased: Number(courseId) } });
        setIsRazorpayLoading(false);
        setPayPhase(null);
        setPayStep(null);
        return;
      }
      // Batch closed while the page was open — refuse BEFORE any money moves.
      if (apiError?.code === "BATCH_CLOSED") {
        toast.error(apiError.message);
        setIsRazorpayLoading(false);
        setPayPhase(null);
        setPayStep(null);
        return;
      }
      // On timeout, the order may still have been created server-side.
      if (apiError?.code === "TIMEOUT") {
        toast.info("Network slow — checking if your order went through...");
        if (await attemptReconcile(Number(courseId))) {
          playSuccessSound();
          toast.success("🎉 Enrollment recovered!");
          clearIdemKey(user.id, String(courseId));
          navigate(`/my-courses/${courseId}?payment=success`, { replace: true, state: { justPurchased: Number(courseId) } });
          setIsRazorpayLoading(false);
          setPayPhase(null);
          setPayStep(null);
          return;
        }
      }
      toast.error(errorMessage(error, "Failed to initiate payment. Please try again."));
      setIsRazorpayLoading(false);
      setPayPhase(null);
      setPayStep(null);
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
      // UPI sabse upar. Test mode me sirf UPI ID (collect) flow maanga jaata
      // hai — intent flow test keys par exist nahi karta aur usse UPI ka block
      // khaali dikh jaata hai.
      ...buildUpiCheckoutConfig(orderData.mode ?? null),
    };

    // Native Capacitor (Android/iOS) → open native Razorpay SDK so UPI
    // intents launch Google Pay / PhonePe / Paytm directly without an
    // in-app browser. Web → fall back to the JS checkout.
    const { Capacitor } = await import("@capacitor/core");

    // Native + fallback → hand the SAME order to the phone's real browser.
    // Never re-open the JS checkout inside our WebView: Razorpay hides the
    // UPI app tiles there, which is exactly the bug users reported.
    if (Capacitor.isNativePlatform() && opts?.forceWeb) {
      try {
        setPayStep("browser");
        setPayMode("browser");
        // The browser tab has no session, so remember the purchase on THIS
        // device. Whenever the student next signs in — same tab, new tab,
        // hours later — `usePaymentResume` finishes the job for them.
        rememberPendingPayment({
          courseId: Number(courseId),
          courseTitle: orderData.course_title ?? null,
          orderId: orderData.order_id,
        });
        toast.info("Payment window khul raha hai — UPI apps wahan dikhenge.");
        await openBrowserCheckout(
          { ...orderData, course_id: courseId },
          {
            name: user.fullName,
            email: user.email,
            contact: profile?.mobile ?? undefined,
          }
        );
        toast.success(
          "Browser me checkout khul gaya. Payment ke baad seedha app/website par wapas aa jaana — course apne aap unlock ho jayega. Dobara pay mat karna.",
          { duration: 8000 },
        );
      } catch (err) {
        logger.error("Browser checkout handoff failed:", err);
        toast.error("Browser checkout khul nahi paya. Internet check karke dobara koshish karein.");
      } finally {
        if (isMountedRef.current) { setIsRazorpayLoading(false); setPayPhase(null); }
      }
      return;
    }
    if (Capacitor.isNativePlatform() && !opts?.forceWeb) {
      try {
        setPayMode("native");
        void tapMedium();
        const resp = await openNativeRazorpayCheckout({
          ...sharedOpts,
          // Test keys get Razorpay's default sheet layout (see
          // buildNativeCheckoutPayload) — the custom UPI block aborts there.
          mode: orderData.mode ?? null,
        }, (step) => {
          if (isMountedRef.current) setPayStep(step);
        });
        await verifyRazorpayPayment(resp);
      } catch (e: unknown) {
        setPayDiag(describePayFailure(e, { order_id: orderData?.order_id, mode: orderData?.mode ?? null }));
        if (e instanceof RazorpayBridgeMissingError || e instanceof RazorpayLaunchTimeoutError) {
          // The native sheet did not open. NEVER auto-redirect to a browser
          // here: a student who suddenly lands on a website mid-purchase gets
          // scared and abandons, and the in-WebView web checkout hides the UPI
          // app tiles anyway. Retry the SAME order in the app once, then stop
          // and offer the browser only as an explicit choice.
          if (!(e instanceof RazorpayBridgeMissingError) && nativeRetryRef.current < 1) {
            nativeRetryRef.current += 1;
            logger.warn("Native Razorpay sheet did not open — retrying in-app");
            toast.info("Payment screen dobara khol rahe hain…");
            await handleRazorpayPayment({ existingOrder: orderData });
            return;
          }
          logger.warn("Native Razorpay sheet failed twice — offering manual browser option");
          void notifyError();
          if (isMountedRef.current) setShowBrowserEscape(true);
          // A missing bridge means the INSTALLED APK predates the payment
          // plugin — retrying in-app can never work, so say so plainly and
          // point at the browser checkout instead of a generic failure.
          toast.error(
            e instanceof RazorpayBridgeMissingError
              ? "Aapka app purana hai — payment screen is version me nahi hai. Play Store se app update karein, ya neeche 'UPI ke liye website se payment karein' dabaein. Paisa nahi kata hai."
              : "Payment screen khul nahi payi. Dobara 'Pay Securely' dabaein — paisa nahi kata hai.",
          );
          return;
        }
        if (e instanceof RazorpayCancelledError) {
          toast.info("Payment cancelled. You can try again whenever you're ready.");
        } else if (e instanceof RazorpaySheetUnresponsiveError) {
          // The native sheet stayed on top for the whole wait ceiling without
          // a result. Deliberately NO web fallback here — a second checkout
          // under a possibly-live payment risks a double charge. Reset the CTA
          // and let webhook/reconciliation own the outcome.
          logger.warn("Native Razorpay sheet unresponsive past ceiling — no web fallback");
          void notifyError();
          toast.error(e.message);
        } else if (e instanceof RazorpayInvalidResponseError) {
          void notifyError();
          toast.error(
            "Payment response complete nahi mili. Agar payment capture hua hai, enrollment webhook se automatically ho jayega — My Courses thodi der mein check karein."
          );
        } else if (e instanceof RazorpayNativeError) {
          // Structured Razorpay failure — pass fields straight through so the
          // formatter renders the actionable message for payment_authentication
          // / BAD_REQUEST_ERROR / bank-side rejections.
          void notifyError();
          toast.error(formatRazorpayError({
            code: e.code, description: e.description, source: e.source,
            step: e.step, reason: e.reason, metadata: e.metadata,
          }) + " If payment was captured, enrollment will happen automatically via webhook.");
        } else {
          void notifyError();
          toast.error(formatRazorpayError({ description: e instanceof Error ? e.message : undefined })
            + " If payment was captured, enrollment will happen automatically via webhook.");
        }
      } finally {
        // Defense-in-depth: never leave the CTA stuck in "Processing…" if any
        // branch above threw synchronously after we cleared the initial spinner.
        if (isMountedRef.current) { setIsRazorpayLoading(false); setPayPhase(null); setPayStep(null); }
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
          toast.error(
            formatRazorpayError(err) +
              " If payment was captured, enrollment will happen automatically via webhook."
          );
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled. You can try again whenever you're ready.");
          },
        },
      });
    } catch (error: unknown) {
      logger.error("Razorpay open error:", error);
      toast.error(
        errorMessage(error, "Failed to open checkout. Please try again.") +
          " If payment was captured, enrollment will happen automatically via webhook."
      );
    } finally {
      if (isMountedRef.current) { setIsRazorpayLoading(false); setPayPhase(null); setPayStep(null); }
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

    } catch (error: unknown) {
      logger.error("Verification error:", error);
      const apiErr = error instanceof PaymentApiError ? error : undefined;
      const msg = errorMessage(error, "razorpay_unreachable");
      const unreachable =
        msg === "razorpay_unreachable" || apiErr?.status === 503;
      // Verification timed out / 5xx / Razorpay unreachable but the money is
      // very likely captured — reconcile before showing any failure.
      if (apiErr?.code === "TIMEOUT" || unreachable || (apiErr?.status && apiErr.status >= 500)) {
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
      toast.error(
        errorMessage(error, "Payment verification failed. Please contact support.") +
          " If payment was captured, enrollment will happen automatically via webhook."
      );
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
        {paymentMode === "test" && (
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
                    className="h-12 w-full text-base active:scale-[0.97] transition-transform duration-150 ease-out"
                    onClick={async () => {
                      void tapLight();
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

                    {/* UPI apps detected on this device get top billing — the
                        student sees exactly which app the payment sheet will
                        hand off to, so nothing feels like a browser redirect. */}
                    {upiApps && upiApps.length > 0 && (
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="mb-2 text-xs font-medium">
                          Aapke phone ke UPI apps — payment sheet par UPI chunein
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {upiApps.slice(0, 6).map((app) => (
                            <span
                              key={app.packageName}
                              className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                            >
                              {app.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {upiApps && upiApps.length === 0 && (
                      <p className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                        Is phone me koi UPI app nahi mila. UPI ID daal kar,
                        ya card / netbanking se bhi pay kar sakte hain.
                      </p>
                    )}

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

                    {paymentMode === "test" && (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                        <p className="font-semibold">Test mode chal raha hai</p>
                        <p className="mt-1">
                          Payment sheet par UPI ka section dikhega, par sirf UPI ID
                          se — test ke liye <span className="font-mono">success@razorpay</span>{" "}
                          daal dein. GPay / PhonePe / Paytm ke tiles live keys par aate hain.
                        </p>
                      </div>
                    )}

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
                  {batchFull ? (
                    <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-center text-sm">
                      <p className="font-semibold text-foreground">Batch Full</p>
                      <p className="mt-1 text-muted-foreground">
                        Is batch me enrollment abhi band hai
                        {seatLimit != null ? ` (${seatsTaken}/${seatLimit} seats)` : ""}.
                        Agli batch khulte hi yahan Buy button wapas aa jayega.
                      </p>
                    </div>
                  ) : isIosNative ? (
                    <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-center text-sm text-muted-foreground">
                      Purchases aren't available in the iOS app. Buy this course on our
                      website, then sign in here to access it.
                    </div>
                  ) : (
                    <Button
                      onClick={() => { void tapLight(); void handleRazorpayPayment(); }}
                      disabled={isRazorpayLoading}
                      className="h-12 w-full text-base font-semibold active:scale-[0.97] transition-transform duration-150 ease-out"
                    >
                      {isRazorpayLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          {payPhase === "opening" ? "Opening payment…" : "Preparing…"}
                        </>
                      ) : (
                        <>
                          <Shield className="mr-2 h-4 w-4" />
                          {upiApps && upiApps.length > 0
                            ? `Pay ₹${course.price} — UPI, Card`
                            : `Pay ₹${course.price} Securely`}
                        </>
                      )}
                    </Button>
                  )}
                  {/* UPI apps (GPay / PhonePe / Paytm) cannot be launched from
                      inside the app's own WebView, so Razorpay hides those tiles
                      there. This option is therefore ALWAYS offered on Android —
                      not only after the in-app sheet has already failed. */}
                  {!batchFull && isNative && !isIosNative && !showBrowserEscape && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { void tapMedium(); void handleRazorpayPayment({ forceWeb: true }); }}
                        disabled={isRazorpayLoading}
                        className="mt-2 h-auto min-h-11 w-full whitespace-normal break-words px-3 py-2.5 text-sm font-semibold leading-snug active:scale-[0.97] transition-transform duration-150 ease-out"
                      >
                        <ExternalLink className="mr-2 h-4 w-4 shrink-0" />
                        UPI app se pay karein (browser)
                      </Button>
                      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                        GPay, PhonePe, Paytm jaise UPI apps app ke andar wale checkout me nahi
                        khul paate. Ye option phone ke browser me checkout kholta hai, jahan
                        saare UPI apps dikhte hain — payment ke baad course apne aap khul jayega.
                      </p>
                    </>
                  )}
                  {!batchFull && isNative && !isIosNative && showBrowserEscape && (
                    <>
                      {/* Always tappable — even mid-attempt. If the native sheet
                          misbehaves the user must never be trapped behind a
                          disabled escape hatch. */}
                      {/* Website-first escape hatch. The student signs in on
                          jsrcoaching.vercel.app and completes the SAME purchase
                          there, with their own session and full UPI support —
                          safer and far less confusing than a bare checkout tab.
                          Always tappable, even mid-attempt: the user must never
                          be trapped behind a disabled escape hatch. */}
                      <Button
                        type="button"
                        onClick={() => { void tapMedium(); void openWebsiteCheckout(courseId); }}
                        className="mt-2 h-auto min-h-12 w-full whitespace-normal break-words px-3 py-2.5 text-sm font-semibold leading-snug active:scale-[0.97] transition-transform duration-150 ease-out"
                      >
                        <ExternalLink className="mr-2 h-4 w-4 shrink-0" />
                        UPI ke liye website se payment karein
                      </Button>
                      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                        UPI (PhonePe / Google Pay / Paytm / BHIM) website par sabse
                        bharosemand chalta hai. Wahan isi account se login karein —
                        payment ke baad course app me apne aap khul jayega.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { void tapMedium(); void handleRazorpayPayment({ forceWeb: true }); }}
                        className="mt-1 h-auto min-h-10 w-full whitespace-normal break-words px-3 py-2 text-xs font-normal leading-snug text-muted-foreground active:scale-[0.97] transition-transform duration-150 ease-out"
                      >
                        Ya sidha browser checkout kholein (card/netbanking)
                      </Button>
                      {(isAdmin || paymentMode === "test") && (
                        <div className="mt-2 rounded-lg border border-dashed bg-muted/40 p-2.5 text-left">
                          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                            Payment diagnostics
                          </p>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted-foreground">
{[
  `build: ${buildLabel ?? "unknown"}`,
  `step: ${payStep ?? "-"} · mode: ${payMode ?? "-"} · key: ${paymentMode ?? "-"}`,
  payDiag ?? "no error captured yet",
].join("\n")}
                          </pre>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 px-2 text-[11px]"
                            onClick={() => {
                              const text = [
                                `build: ${buildLabel ?? "unknown"}`,
                                `step: ${payStep ?? "-"} · mode: ${payMode ?? "-"} · key: ${paymentMode ?? "-"}`,
                                payDiag ?? "no error captured yet",
                              ].join("\n");
                              void navigator.clipboard?.writeText(text).then(
                                () => toast.success("Diagnostics copy ho gaye"),
                                () => toast.error("Copy nahi ho paya"),
                              );
                            }}
                          >
                            Copy details
                          </Button>
                        </div>
                      )}
                    </>
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

              <Button onClick={() => { void tapLight(); navigate('/my-courses'); }} className="w-full max-w-xs bg-green-600 hover:bg-green-700 active:scale-[0.97] transition-transform duration-150 ease-out">
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
