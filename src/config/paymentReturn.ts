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
import { APP_SCHEME, APP_LINK_HOSTS } from "./deepLinks";

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

/**
 * Legacy parameter names still accepted by the reader. Older APKs, Razorpay's
 * own web-redirect form and hand-typed support links used these; a link is
 * never rejected just because it speaks the previous dialect.
 */
export const LEGACY_PAYMENT_RETURN_PARAMS = {
  status: ["status"],
  course: ["course_id", "courseId"],
  order: ["razorpay_order_id", "order_id"],
} as const;

export interface ParsedPaymentReturn {
  /** Positive integer course id, or null when the link carried none. */
  courseId: number | null;
  /** Lower-cased outcome; `""` when absent. */
  status: string;
  /** Razorpay order id for diagnostics only. */
  orderId: string | null;
}

/**
 * ONE reader for every return link the app can receive. Reads the shared
 * names first, then the legacy names, so `PayBrowser` (writer) and
 * `PaymentCallback` (reader) can never disagree again — the 2026-09-21 UPI
 * recording landed on "Link poora nahi mila" purely because the writer said
 * `course=` and the reader looked for `course_id=`.
 *
 * Accepts anything with `.get()` (URLSearchParams, react-router's params).
 */
export const parsePaymentReturnParams = (
  params: { get(name: string): string | null },
): ParsedPaymentReturn => {
  const first = (names: readonly string[]): string | null => {
    for (const n of names) {
      const v = params.get(n);
      if (v !== null && v !== "") return v;
    }
    return null;
  };
  const rawCourse = first([PAYMENT_RETURN_PARAMS.course, ...LEGACY_PAYMENT_RETURN_PARAMS.course]);
  const n = Number(rawCourse);
  return {
    courseId: Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : null,
    status: (first([PAYMENT_RETURN_PARAMS.status, ...LEGACY_PAYMENT_RETURN_PARAMS.status]) ?? "")
      .trim()
      .toLowerCase(),
    orderId: first([PAYMENT_RETURN_PARAMS.order, ...LEGACY_PAYMENT_RETURN_PARAMS.order]),
  };
};

/**
 * WHERE EVERY CONFIRMED ENROLLMENT LANDS — the My Courses LIST.
 *
 * Product rule (owner, 2026-09-21): the moment a course is unlocked the
 * student must see it sitting in My Courses, so nobody panics with "paisa kat
 * gaya par course nahi aaya". Course detail pages are one tap away from there;
 * they are never the automatic destination. `payment=success&course=<id>`
 * lets My Courses highlight the new card and reconcile if the row is a few
 * seconds late; router `state.justPurchased` carries the same hint.
 */
export const MY_COURSES_PATH = "/my-courses";

export const buildPostEnrollmentPath = (
  courseId: number | string | null | undefined,
  status: "success" | "pending" = "success",
): string => {
  const q = new URLSearchParams({ [PAYMENT_RETURN_PARAMS.status]: status });
  if (courseId !== undefined && courseId !== null && `${courseId}` !== "") {
    q.set(PAYMENT_RETURN_PARAMS.course, String(courseId));
  }
  return `${MY_COURSES_PATH}?${q.toString()}`;
};

/** Router state that travels with {@link buildPostEnrollmentPath}. */
export const postEnrollmentState = (courseId: number | string | null | undefined) => ({
  justPurchased: Number(courseId) > 0 ? Number(courseId) : undefined,
});

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

/**
 * Android `intent://` form of the same link.
 *
 * WHY: Chrome refuses a programmatic `location.href = "customscheme://…"`
 * navigation when it was not started by a user gesture, and a Custom Tab
 * silently drops it. The `intent:` syntax with an explicit `package=` is the
 * documented Android hand-off and survives that restriction, so a paid
 * student is never stranded on a browser tab.
 */
export const buildPaymentReturnIntentUrl = (
  status: PaymentReturnStatus,
  opts: { courseId?: string | number | null; orderId?: string | null } = {},
): string => {
  const deep = buildPaymentReturnUrl(status, opts);
  const query = deep.split("?")[1] ?? "";
  return (
    `intent://payment-callback${query ? `?${query}` : ""}` +
    `#Intent;scheme=${APP_SCHEME};package=${APP_SCHEME};` +
    `S.browser_fallback_url=${encodeURIComponent(buildPaymentReturnWebUrl(status, opts))};end`
  );
};

/**
 * Verified https App Link for the same destination. Android opens the app for
 * this host (assetlinks.json + autoVerify); if the app is not installed the
 * student simply lands on the website, which is a valid outcome too.
 */
export const buildPaymentReturnWebUrl = (
  status: PaymentReturnStatus,
  opts: { courseId?: string | number | null; orderId?: string | null } = {},
): string => {
  const query = buildPaymentReturnUrl(status, opts).split("?")[1] ?? "";
  return `https://${APP_LINK_HOSTS[0]}/payment-callback${query ? `?${query}` : ""}`;
};

/** How long the app waits for the webhook before showing a calm "check later". */
export const RETURN_POLL_INTERVAL_MS = 3000;
export const RETURN_MAX_POLLS = 15; // ~45s, same window as usePaymentSync

/** Gap between hand-off attempts before falling back to the next form. */
export const RETURN_HANDOFF_STEP_MS = 1200;
