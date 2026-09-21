/**
 * Landing screen after a payment returns to the app (UPI intent / browser
 * checkout / deep link). Its ONLY job: figure out whether the student now owns
 * the course and move them forward — never leave them staring at a spinner.
 *
 * WHAT WENT WRONG BEFORE (recording 2026-09-21 13:08)
 * The effect was keyed on the `user` OBJECT. Every Supabase token refresh /
 * profile enrichment produced a new object, so the effect's cleanup ran and
 * cancelled the in-flight enrollment waiter, then the new run started over —
 * "Enrollment confirm ho raha hai" stayed on screen for ~29 s while the course
 * was already unlocked. Fixes here:
 *   1. effect keyed on `userId` + a serialized params string, never objects;
 *   2. cancellation only on real unmount, not on identity churn;
 *   3. a direct, rate-limit-free read of the student's own enrollment row
 *      before any polling, plus the shared enrollment-landed event;
 *   4. a hard patience ceiling that always ends in a terminal state with
 *      actions, instead of an endless spinner.
 *
 * WHAT WENT WRONG NEXT (recording 2026-09-21 15:10, browser UPI)
 *   5. `/pay` wrote `course=<id>` (shared `PAYMENT_RETURN_PARAMS`) but this
 *      screen only read `course_id=` — every browser-UPI return hit "Link
 *      poora nahi mila" with the course already unlocked. The link is now read
 *      through the ONE shared parser, legacy names included.
 *   6. Success sent the student to the course page, not My Courses. Product
 *      rule: every confirmed enrollment lands on the My Courses list, where the
 *      new card is visible — nobody panics about "course nahi aaya".
 *   7. In a plain browser with no session (App Link not yet verified, app not
 *      installed, or Chrome kept the tab) the student was silently pushed to
 *      the login form. They now get a calm choice: open the app, or sign in
 *      here in the browser — the payment is acknowledged either way.
 *
 * SECURITY: this screen grants nothing. Enrollment comes from the HMAC-verified
 * webhook or the server-side verify/recover functions.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  RefreshCw,
  BookOpen,
  Smartphone,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { recoverEnrollmentDetailed } from "@/utils/paymentApi";
import {
  waitForEnrollment,
  hasActiveEnrollment,
  onEnrollmentLanded,
  announceEnrollmentLanded,
} from "@/utils/reconcileEnrollment";
import { markEnrollmentChanged } from "@/lib/enrollmentFreshness";
import {
  parsePaymentReturnParams,
  buildPostEnrollmentPath,
  postEnrollmentState,
  buildPaymentReturnIntentUrl,
  buildPaymentReturnUrl,
  RETURN_HANDOFF_STEP_MS,
} from "@/config/paymentReturn";
import { isNativePlatform } from "@/lib/native/core";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { addBreadcrumb } from "@/lib/sentry";

type Phase = "checking" | "syncing" | "done" | "failed" | "cancelled" | "signed-out-web";

/**
 * After this long without an enrollment we stop showing an open-ended spinner
 * and hand the student explicit choices (re-check / My Courses). The waiter
 * keeps running in the background either way.
 */
export const SYNC_PATIENCE_MS = 20_000;

/** Short beat so the student sees the green tick before My Courses opens. */
export const SUCCESS_REDIRECT_DELAY_MS = 900;

const PaymentCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // Primitive keys only — objects would restart the effect on token refresh.
  const userId = user?.id ?? null;
  const parsed = useMemo(() => parsePaymentReturnParams(params), [params]);
  const { courseId, status, orderId } = parsed;
  const paramsKey = `${courseId ?? ""}|${status}`;

  const [phase, setPhase] = useState<Phase>("checking");
  const [patienceElapsed, setPatienceElapsed] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const mountedRef = useRef(true);
  const settledRef = useRef(false);
  /** Guards against a duplicate run for the same (user, params) pair. */
  const runKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Unmount only. NOT tied to auth-object identity.
      mountedRef.current = false;
    };
  }, []);

  const loginHref = `/login?redirect=${encodeURIComponent(`/payment-callback?${params.toString()}`)}`;

  const succeed = useMemo(
    () => (cid: number, source: string) => {
      if (settledRef.current || !mountedRef.current) return;
      settledRef.current = true;
      addBreadcrumb("payments", "callback settled", { source, courseId: cid });
      // Drop every enrollment-bearing cache so My Courses / lesson pages read
      // fresh, then tell any other open screen.
      markEnrollmentChanged(cid, userId);
      announceEnrollmentLanded(cid, "verify");
      setPhase("done");
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        navigate(buildPostEnrollmentPath(cid, "success"), {
          replace: true,
          state: postEnrollmentState(cid),
        });
      }, SUCCESS_REDIRECT_DELAY_MS);
    },
    [navigate, userId],
  );

  useEffect(() => {
    if (authLoading) return;

    // Signed out on return (cold start / killed app / plain browser tab).
    if (!userId) {
      let alive = true;
      void isNativePlatform()
        .catch(() => false)
        .then((native) => {
          if (!alive || !mountedRef.current) return;
          if (native) {
            // Inside the app: sign in and come straight back here.
            navigate(loginHref, { replace: true });
          } else {
            // Plain browser: offer "open the app" or "sign in here" instead of
            // a bare login form — the payment itself is acknowledged.
            setPhase("signed-out-web");
          }
        });
      return () => {
        alive = false;
      };
    }

    if (courseId === null) {
      setPhase("failed");
      return;
    }

    const runKey = `${userId}|${paramsKey}`;
    if (runKeyRef.current === runKey) return; // identity churn — keep going
    runKeyRef.current = runKey;
    settledRef.current = false;
    setPhase("checking");

    let stopLanded: (() => void) | undefined;
    let patienceTimer: number | undefined;

    const run = async () => {
      // A user-cancelled return still gets an enrollment check first: UPI apps
      // sometimes report "cancelled" for a payment that did go through.
      const userCancelled = status === "cancelled" || status === "failed";

      if (await hasActiveEnrollment(courseId, userId)) {
        succeed(courseId, "direct");
        return;
      }
      if (!mountedRef.current) return;

      if (userCancelled) {
        setPhase("cancelled");
        return;
      }

      setPhase("syncing");
      patienceTimer = window.setTimeout(() => {
        if (mountedRef.current) setPatienceElapsed(true);
      }, SYNC_PATIENCE_MS);

      stopLanded = onEnrollmentLanded(courseId, (detail) => succeed(courseId, detail.source));

      const result = await waitForEnrollment(courseId, {
        userId,
        isCancelled: () => !mountedRef.current || settledRef.current,
      });
      if (!mountedRef.current || settledRef.current) return;

      if (result === "recovered") {
        succeed(courseId, "waiter");
      } else if (result === "not-yet") {
        // Not a red error: the payment may simply still be settling. Show the
        // patient state with actions rather than "payment failed".
        setPatienceElapsed(true);
        logger.warn("Payment callback: enrollment not visible within window", { courseId });
      }
    };

    void run().catch((err) => {
      logger.error("Payment callback run failed", err);
      if (mountedRef.current && !settledRef.current) setPatienceElapsed(true);
    });

    return () => {
      stopLanded?.();
      if (patienceTimer) window.clearTimeout(patienceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId, paramsKey]);

  const recheck = async () => {
    if (courseId === null || rechecking) return;
    setRechecking(true);
    try {
      if (await hasActiveEnrollment(courseId, userId)) {
        succeed(courseId, "manual-direct");
        return;
      }
      // Manual tap bypasses the client-side budget; the server's own rate
      // limit still applies and is surfaced calmly below.
      const result = await recoverEnrollmentDetailed(courseId, { force: true });
      if (result.outcome === "recovered") {
        succeed(courseId, "manual-recover");
      } else if (mountedRef.current) {
        setPatienceElapsed(true);
      }
    } catch (err) {
      logger.error("Manual recheck failed", err);
    } finally {
      if (mountedRef.current) setRechecking(false);
    }
  };

  /**
   * Browser-only: a real tap that hands the same link to the installed app.
   * `intent://` first (Chrome's documented form), custom scheme as follow-up.
   * Both are user-gesture navigations here, so Chrome honours them.
   */
  const openInApp = () => {
    const s = status === "cancelled" ? "cancelled" : "success";
    const opts = { courseId, orderId };
    addBreadcrumb("payments", "callback:open-in-app", { courseId, order_id: orderId });
    try {
      window.location.href = buildPaymentReturnIntentUrl(s, opts);
    } catch {
      /* fall through to the custom scheme below */
    }
    window.setTimeout(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        window.location.href = buildPaymentReturnUrl(s, opts);
      } catch {
        /* the login button remains as the manual path */
      }
    }, RETURN_HANDOFF_STEP_MS);
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] flex items-center justify-center px-5 py-10 bg-background">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        {children}
      </div>
    </div>
  );

  if (phase === "signed-out-web") {
    const paid = status !== "cancelled" && status !== "failed";
    return shell(
      <>
        {paid ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        )}
        <h1 className="mt-4 text-lg font-semibold text-foreground">
          {paid ? "Payment mil gaya" : "Payment poora nahi hua"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {paid
            ? "Aapka paisa surakshit hai — course My Courses me unlock ho raha hai. Aage kahan dekhna chahenge?"
            : "Koi paisa nahi kata. App me wapas jaakar jab chahein dobara try kar sakte hain."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button className="h-12 text-base" onClick={openInApp}>
            <Smartphone className="mr-2 h-4 w-4" aria-hidden />
            App me kholein
          </Button>
          <Button variant="outline" className="h-12" asChild>
            <Link to={loginHref}>
              <LogIn className="mr-2 h-4 w-4" aria-hidden />
              Browser me login karke dekhein
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          App khud bhi khol sakte hain — course apne aap My Courses me aa jayega.
        </p>
      </>,
    );
  }

  if (phase === "done") {
    return shell(
      <>
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-foreground">Payment successful</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Course unlock ho gaya — My Courses khol rahe hain…
        </p>
      </>,
    );
  }

  if (phase === "failed") {
    return shell(
      <>
        <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-foreground">Link poora nahi mila</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Is link mein course ki detail nahi thi. My Courses check karein — payment hua hoga to
          course wahan dikhega.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild>
            <Link to="/my-courses">My Courses</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/courses">Courses</Link>
          </Button>
        </div>
      </>,
    );
  }

  if (phase === "cancelled") {
    return shell(
      <>
        <XCircle className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-foreground">Payment poora nahi hua</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Koi paisa nahi kata. Jab chahein dobara try kar sakte hain.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {courseId !== null && (
            <Button asChild>
              <Link to={`/buy/${courseId}`}>Dobara try karein</Link>
            </Button>
          )}
          <Button variant="ghost" onClick={recheck} disabled={rechecking}>
            {rechecking ? "Check kar rahe hain…" : "Paisa kat gaya? Check karein"}
          </Button>
        </div>
      </>,
    );
  }

  // checking / syncing
  return shell(
    <>
      <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold text-foreground">
        {phase === "checking" ? "Payment check kar rahe hain" : "Enrollment confirm ho raha hai"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {patienceElapsed
          ? "Bank se confirmation aane mein kabhi 1–2 minute lagte hain. Aapka paisa safe hai — course apne aap unlock ho jayega."
          : "Ek second — app aapki payment verify kar raha hai."}
      </p>
      {patienceElapsed && (
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={recheck} disabled={rechecking}>
            <RefreshCw className={`mr-2 h-4 w-4 ${rechecking ? "animate-spin" : ""}`} aria-hidden />
            {rechecking ? "Check kar rahe hain…" : "Dobara check karein"}
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/my-courses">
              <BookOpen className="mr-2 h-4 w-4" aria-hidden />
              My Courses
            </Link>
          </Button>
        </div>
      )}
    </>,
  );
};

export default PaymentCallback;
