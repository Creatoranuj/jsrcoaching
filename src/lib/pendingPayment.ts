/**
 * "Immortal" memory of a payment the student has just started.
 *
 * WHY THIS EXISTS
 * The browser (Custom Tab) checkout runs in a tab that has NO Supabase
 * session. After paying, the student is bounced to /login and everything the
 * app knew about that purchase — which course, which order — lived only in
 * the URL. Close the tab, log in from somewhere else, or come back an hour
 * later and the app had no idea a payment was pending, so the student stared
 * at a locked course and (worst case) paid twice.
 *
 * This module writes that intent to local storage BEFORE the checkout opens,
 * so any later sign-in on the same device can pick it up and finish the job.
 *
 * SECURITY: nothing here grants anything. It is a reminder, not an
 * entitlement — enrollment still comes only from `razorpay-webhook` and the
 * idempotent `recover-enrollment` function, both server side.
 */
import { safeGet, safeSet, safeRemove } from "./storage";

const KEY = "nb:pendingPayment";

/** Longer than any realistic webhook delay, short enough to not haunt a device. */
const TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingPayment {
  courseId: number;
  courseTitle?: string;
  orderId?: string;
  /** epoch ms when the checkout was opened */
  ts: number;
}

export const rememberPendingPayment = (
  p: { courseId: number | string; courseTitle?: string | null; orderId?: string | null },
): void => {
  const courseId = Number(p.courseId);
  if (!Number.isFinite(courseId) || courseId <= 0) return;
  const payload: PendingPayment = {
    courseId,
    ...(p.courseTitle ? { courseTitle: p.courseTitle } : {}),
    ...(p.orderId ? { orderId: p.orderId } : {}),
    ts: Date.now(),
  };
  safeSet(KEY, JSON.stringify(payload));
};

export const readPendingPayment = (): PendingPayment | null => {
  const raw = safeGet(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPayment>;
    const courseId = Number(parsed?.courseId);
    const ts = Number(parsed?.ts);
    if (!Number.isFinite(courseId) || courseId <= 0) return null;
    if (!Number.isFinite(ts) || Date.now() - ts > TTL_MS) {
      clearPendingPayment();
      return null;
    }
    return { ...(parsed as PendingPayment), courseId, ts };
  } catch {
    clearPendingPayment();
    return null;
  }
};

export const clearPendingPayment = (): void => {
  safeRemove(KEY);
};
