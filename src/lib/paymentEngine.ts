/**
 * Post-payment settlement engine — ONE brain for "the sheet closed, now what?"
 *
 * WHY THIS EXISTS
 * After Razorpay hands back a success response, three things used to happen in
 * three different places (verify call, timeout reconcile, cache refresh), and
 * the student could be left staring at the payment page while they raced.
 * This engine owns the whole hand-off:
 *
 *   sheet success ──▶ verify (server HMAC) ──▶ enrolled  → caches dropped,
 *                                                            pending memory
 *                                                            cleared, caller
 *                                                            redirects NOW
 *                       │ timeout / 5xx / unreachable
 *                       ▼
 *                     quick reconcile (2 bounded calls) ──▶ enrolled / pending
 *
 *   "pending" is NOT a failure: money is very likely captured and the webhook
 *   will land. The caller redirects to the course page's "Syncing your
 *   course…" gate (usePaymentSync) instead of stranding the student here.
 *
 * DUPLICATE-PROOF
 * Settlement is single-flight per Razorpay order id. A double-tap, a re-render
 * or an overlapping handler call all await the SAME promise — the server is
 * never asked to verify one order twice in parallel. (The server is idempotent
 * anyway; this keeps the client honest and the rate budget intact.)
 *
 * SECURITY
 * This grants nothing. `verify-razorpay-payment` (signature check, amount
 * check, fail-closed rate limit) and the HMAC-verified `razorpay-webhook` are
 * the only things that enroll a student — both server side. The engine only
 * asks, waits, and cleans up caches.
 */
import { invokePaymentFunction, recoverEnrollment, PaymentApiError } from "@/utils/paymentApi";
import { markEnrollmentChanged } from "@/lib/enrollmentFreshness";
import { clearPendingPayment } from "@/lib/pendingPayment";
import { getErrorMessage as errorMessage } from "@/lib/errorMessage";
import type { RazorpaySuccessResponse } from "@/utils/razorpay";

export type SettleOutcome = "enrolled" | "pending" | "failed";

export interface SettleResult {
  outcome: SettleOutcome;
  /** Human-readable reason, only meaningful for "failed". */
  reason?: string;
}

export interface SettleOptions {
  courseId: number;
  userId?: string | null;
  response: RazorpaySuccessResponse;
}

/** Single-flight table: order_id → in-progress settlement. */
const inflight = new Map<string, Promise<SettleResult>>();

/** Short backoff before the second reconcile — webhook may still be in flight. */
const RECONCILE_RETRY_DELAY_MS = 2_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Everything that has to happen the moment the server confirms enrollment. */
const onConfirmed = (courseId: number, userId?: string | null): void => {
  markEnrollmentChanged(courseId, userId ?? undefined);
  clearPendingPayment();
};

const settleInner = async (opts: SettleOptions): Promise<SettleResult> => {
  const { courseId, userId, response } = opts;
  try {
    await invokePaymentFunction("verify-razorpay-payment", {
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature,
      course_id: courseId,
    });
    onConfirmed(courseId, userId);
    return { outcome: "enrolled" };
  } catch (error: unknown) {
    const apiErr = error instanceof PaymentApiError ? error : undefined;
    const msg = errorMessage(error, "razorpay_unreachable");
    const unreachable = msg === "razorpay_unreachable" || apiErr?.status === 503;
    const maybeCaptured =
      apiErr?.code === "TIMEOUT" || unreachable || (apiErr?.status !== undefined && apiErr.status >= 500);

    if (!maybeCaptured) {
      // Hard 4xx — bad signature, refunded order, wrong course. Real failure.
      return {
        outcome: "failed",
        reason:
          errorMessage(error, "Payment verification failed. Please contact support.") +
          " If payment was captured, enrollment will happen automatically via webhook.",
      };
    }

    // Verification timed out / 5xx but the money is very likely captured —
    // two bounded reconcile attempts before handing off to the syncing gate.
    if ((await recoverEnrollment(courseId)) === "recovered") {
      onConfirmed(courseId, userId);
      return { outcome: "enrolled" };
    }
    await sleep(RECONCILE_RETRY_DELAY_MS);
    if ((await recoverEnrollment(courseId)) === "recovered") {
      onConfirmed(courseId, userId);
      return { outcome: "enrolled" };
    }
    return { outcome: "pending" };
  }
};

/**
 * Settle a completed checkout. Duplicate calls for the same order share one
 * promise, so verify is never raced against itself.
 */
export const settlePayment = (opts: SettleOptions): Promise<SettleResult> => {
  const key = opts.response.razorpay_order_id || `course:${opts.courseId}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = settleInner(opts).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
};

/**
 * One quiet server check after the sheet reports a dismissal.
 *
 * UPI intent flows can complete inside Google Pay / PhonePe even when the
 * Razorpay sheet reports "cancelled" (student pays, then backs out of the
 * sheet). Never trust the dismissal alone: ask the server ONCE. If the
 * payment landed, refresh caches so the caller can celebrate; if not, clear
 * the device's pending-payment reminder so resume never shows a false
 * "payment mil gaya" toast for a genuinely cancelled attempt.
 */
export const dismissSafetyCheck = async (
  courseId: number,
  userId?: string | null,
): Promise<boolean> => {
  try {
    if ((await recoverEnrollment(courseId)) === "recovered") {
      onConfirmed(courseId, userId);
      return true;
    }
  } catch {
    // Network hiccup — keep the pending reminder; resume will retry later.
    return false;
  }
  clearPendingPayment();
  return false;
};
