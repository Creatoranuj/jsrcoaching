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
export const invokePaymentFunction = async <T = any>(
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

export const recoverEnrollment = async (courseId: number): Promise<RecoverOutcome> => {
  try {
    await invokePaymentFunction("recover-enrollment", { course_id: Number(courseId) });
    return "recovered";
  } catch (err) {
    const status = (err as PaymentApiError)?.status;
    if (status === 404 || status === 429) return "not-yet";
    return "failed";
  }
};

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
