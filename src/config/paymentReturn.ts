/**
 * Single source of truth for the deep link that brings a student BACK into the
 * app after paying in the phone's real browser (`/pay` in an Android Custom
 * Tab).
 *
 * WHY THIS FILE EXISTS
 * `PayBrowser` used to build the return URL with its own parameter names
 * (`payment`, `course`, `order`) while `PaymentCallback` only understood the
 * web-redirect names (`razorpay_payment_id`, `razorpay_order_id`,
 * `razorpay_signature`, `course_id`). A paid student therefore landed on the
 * red "Verification Issue" screen even though `razorpay-webhook` had already
 * granted the enrollment. Both sides now import from here, so the names can
 * never drift again.
 *
 * SECURITY: these params carry no entitlement. Enrollment is granted only by
 * `razorpay-webhook` (HMAC verified, server side); the app merely reconciles.
 */
import { APP_SCHEME } from "./deepLinks";

/** Param names shared by PayBrowser (writer) and PaymentCallback (reader). */
export const PAYMENT_RETURN_PARAMS = {
  /** `"success" | "cancelled"` — outcome reported by the browser tab. */
  status: "payment",
  /** Course id, so the app can poll `recover-enrollment` for the right course. */
  course: "course",
  /** Razorpay order id — diagnostics only, never trusted. */
  order: "order",
} as const;

export type PaymentReturnStatus = "success" | "cancelled";

/** Deep link the browser tab navigates to in order to reopen the app. */
export const buildPaymentReturnUrl = (
  status: PaymentReturnStatus,
  opts: { courseId?: string | number | null; orderId?: string | null } = {},
): string => {
  const q = new URLSearchParams({ [PAYMENT_RETURN_PARAMS.status]: status });
  if (opts.courseId !== undefined && opts.courseId !== null && `${opts.courseId}` !== "") {
    q.set(PAYMENT_RETURN_PARAMS.course, String(opts.courseId));
  }
  if (opts.orderId) q.set(PAYMENT_RETURN_PARAMS.order, opts.orderId);
  return `${APP_SCHEME}://payment-callback?${q.toString()}`;
};

/** How long the app waits for the webhook before showing a calm "check later". */
export const RETURN_POLL_INTERVAL_MS = 3000;
export const RETURN_MAX_POLLS = 15; // ~45s, same window as usePaymentSync
