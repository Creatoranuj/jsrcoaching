// Centralised payment API helper.
//
// Why this exists:
//   The previous code called `fetch("/api/functions/v1/<fn>")`. That path only
//   resolved on Replit (Express proxy) and silently returned `index.html`
//   inside the Capacitor APK — making real-device payments impossible. This
//   helper uses `supabase.functions.invoke`, which works identically in
//   Lovable preview, Vercel/static hosting and the Capacitor WebView.
//
// What it adds on top of plain `invoke`:
//   • Network preflight (@capacitor/network) — fails fast on Airplane mode
//     before opening the Razorpay sheet, so the user sees a clear toast
//     instead of a frozen checkout.
//   • Request timeout — Razorpay order creation must not hang forever; the
//     UI button stays in a loading state if the edge function never replies.
//   • Light haptic feedback on success / error (Android + iOS only).

import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TIMEOUT_MS = 20_000;

export class PaymentApiError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = "PaymentApiError";
    this.status = opts?.status;
    this.code = opts?.code;
  }
}

/** Fail fast when the device is offline (Capacitor native only — web `navigator.onLine` is unreliable). */
export const assertOnline = async (): Promise<void> => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Network } = await import("@capacitor/network");
    const status = await Network.getStatus();
    if (!status.connected) {
      throw new PaymentApiError(
        "No internet connection. Connect to Wi-Fi or mobile data and try again.",
        { code: "OFFLINE" }
      );
    }
  } catch (err) {
    if (err instanceof PaymentApiError) throw err;
    // Plugin missing or other – don't block payment on diagnostic failure.
  }
};

/**
 * Invoke a Supabase edge function with a hard timeout and normalised errors.
 * Works in every environment (preview, Vercel, Capacitor APK/IPA).
 */
export const invokePaymentFunction = async <T = unknown>(
  name: string,
  body: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> => {
  await assertOnline();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new PaymentApiError(
            "Payment server took too long to respond. Please try again.",
            { code: "TIMEOUT" }
          )
        ),
      timeoutMs
    );
  });

  const invokePromise = (async () => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      // supabase.functions.invoke returns FunctionsHttpError | FunctionsRelayError
      // | FunctionsFetchError — all extend FunctionsError. `context` is the raw
      // Response only on FunctionsHttpError; guard before touching it.
      const { FunctionsHttpError } = await import('@supabase/functions-js');
      let status: number | undefined;
      let serverMsg: string | undefined;
      if (error instanceof FunctionsHttpError) {
        status = error.context?.status;
        let serverCode: string | undefined;
        let serverDetail: string | undefined;
        try {
          const j = (await error.context?.json?.()) as { error?: string; code?: string; detail?: string } | undefined;
          serverMsg = j?.error;
          serverCode = j?.code;
          serverDetail = j?.detail;
        } catch {
          /* body wasn't JSON */
        }
        throw new PaymentApiError(
          serverMsg || serverDetail || "Payment server error",
          { status, code: serverCode }
        );
      }
      throw new PaymentApiError(
        serverMsg || (error as Error).message || "Payment server error",
        { status }
      );
    }
    return data as T;
  })();

  return Promise.race([invokePromise, timeoutPromise]);
};

/**
 * Ask the server to reconcile a missing enrollment.
 *
 * A 404 here is an EXPECTED, non-error outcome: it just means Razorpay has no
 * captured payment for this course yet (webhook not fired / user cancelled).
 * Treating it as a thrown error used to bubble up as an unhandled rejection
 * and blank the screen, so it is normalised into "not-yet" instead.
 */
export type RecoverOutcome = "recovered" | "not-yet" | "failed";

/**
 * Why a failure happened — drives both the user-facing toast and whether the
 * failure is worth a Sentry issue at all:
 *   auth    → 401: session expired; user must sign in again (not a bug).
 *   offline → no network / timeout before the server answered (not a bug).
 *   server  → 4xx/5xx from recover-enrollment (AMOUNT_MISMATCH, Razorpay not
 *             configured, enrollment RPC failed …) — the only reportable kind.
 */
export type RecoverFailureReason = "auth" | "offline" | "server";

export interface RecoverResult {
  outcome: RecoverOutcome;
  status?: number;
  code?: string;
  message?: string;
  reason?: RecoverFailureReason;
}

const classifyRecoverFailure = (err: PaymentApiError): RecoverFailureReason => {
  if (err.status === 401) return "auth";
  if (err.code === "OFFLINE" || err.code === "TIMEOUT") return "offline";
  if (err.status === undefined && /fetch|network/i.test(err.message)) return "offline";
  return "server";
};

/**
 * Detailed variant: callers that show UI or report to Sentry need the status,
 * server code and reason — a bare "failed" string forced every caller to log
 * its own generic error, which is how the same failure landed in Sentry three
 * times (SAFAR-ENGLISH-APP-15/16/17).
 */

/**
 * Shared budget + de-duplication gate in front of `recover-enrollment`.
 *
 * WHY: four independent surfaces ask "has my enrollment landed yet?" — the
 * global resume watcher (`usePaymentResume`), the boot sweep
 * (`useEnrollmentRecovery`), the My Courses arrival poll
 * (`useEnrollmentArrival`) and the post-checkout sync gate (`usePaymentSync`).
 * The server allows only **5 calls / 60 s per user** and normalises 429 to
 * "not-yet", so an over-eager caller silently spends everybody else's budget:
 * the student watches a spinner while every request is being rejected.
 *
 * Putting the gate here — rather than in one caller — means no future call
 * site can bypass it. It de-duplicates concurrent asks for the same course and
 * never spends more than MAX_CALLS_PER_WINDOW calls in a rolling minute,
 * keeping one in reserve for the manual "I paid but don't see my course"
 * button (`{ force: true }`).
 *
 * It grants nothing: `razorpay-webhook` (HMAC verified) and the idempotent
 * `complete_paid_enrollment` RPC are the only things that enroll a student.
 */
const RECOVER_WINDOW_MS = 60_000;
/** Server allows 5/60s; spend 4 and reserve one for the manual retry. */
const RECOVER_MAX_CALLS_PER_WINDOW = 4;

const recoverCallTimestamps: number[] = [];
const recoverInFlight = new Map<number, Promise<RecoverResult>>();

/** Calls we are still willing to spend in the current rolling minute. */
export const recoverBudgetLeft = (): number => {
  const now = Date.now();
  while (recoverCallTimestamps.length > 0 && now - recoverCallTimestamps[0] > RECOVER_WINDOW_MS) {
    recoverCallTimestamps.shift();
  }
  return Math.max(0, RECOVER_MAX_CALLS_PER_WINDOW - recoverCallTimestamps.length);
};

export const recoverEnrollmentDetailed = async (
  courseId: number,
  opts: { force?: boolean } = {},
): Promise<RecoverResult> => {
  // Someone else is already asking about this exact course — share the answer
  // rather than spending a second call on it.
  const existing = recoverInFlight.get(courseId);
  if (existing) return existing;

  if (recoverBudgetLeft() <= 0 && !opts.force) {
    // Shaped like a server 429 so every caller's existing "not-yet" handling
    // (calm copy, try again later) works unchanged.
    return { outcome: "not-yet", status: 429, code: "CLIENT_THROTTLED" };
  }

  recoverCallTimestamps.push(Date.now());
  const promise = runRecoverEnrollment(courseId).finally(() => {
    recoverInFlight.delete(courseId);
  });
  recoverInFlight.set(courseId, promise);
  return promise;
};

const runRecoverEnrollment = async (courseId: number): Promise<RecoverResult> => {
  try {
    await invokePaymentFunction("recover-enrollment", { course_id: Number(courseId) });
    return { outcome: "recovered" };
  } catch (err) {
    const e = err instanceof PaymentApiError
      ? err
      : new PaymentApiError((err as Error)?.message || "recover-enrollment failed");
    if (e.status === 404 || e.status === 429) {
      return { outcome: "not-yet", status: e.status, code: e.code, message: e.message };
    }
    return {
      outcome: "failed",
      status: e.status,
      code: e.code,
      message: e.message,
      reason: classifyRecoverFailure(e),
    };
  }
};

/** Shorthand kept for callers that only branch on the outcome. */
export const recoverEnrollment = async (courseId: number): Promise<RecoverOutcome> =>
  (await recoverEnrollmentDetailed(courseId)).outcome;

/**
 * Canonical error for a *server-side* recovery failure. The message carries
 * status + code so Sentry groups by cause ("recover-enrollment 500 RPC_FAILED")
 * instead of one bucket per call site.
 */
export class EnrollmentRecoveryError extends Error {
  status?: number;
  code?: string;
  reason?: RecoverFailureReason;
  constructor(result: RecoverResult) {
    super(`recover-enrollment ${result.status ?? "?"} ${result.code ?? "UNKNOWN"}`);
    this.name = "EnrollmentRecoveryError";
    this.status = result.status;
    this.code = result.code;
    this.reason = result.reason;
  }
}

/** Native haptic on payment success. No-op on web. */

export const hapticPaymentSuccess = async (): Promise<void> => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* haptics optional */
  }
};

/** Native haptic on payment failure / cancellation. No-op on web. */
export const hapticPaymentError = async (): Promise<void> => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    /* haptics optional */
  }
};
