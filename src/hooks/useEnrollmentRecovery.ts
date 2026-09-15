import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { recoverEnrollment } from "@/utils/paymentApi";
import { addBreadcrumb, reportError } from "@/lib/sentry";
import { toast } from "sonner";

/**
 * Global enrollment auto-recovery.
 *
 * Scenario: user pays via Razorpay, back-button pressed (or app killed) before
 * verify-razorpay-payment could return. The webhook (`razorpay-webhook`) is the
 * server-side safety net, but if it's delayed and the user opens the app on
 * a route other than /buy-course, `BuyCourse`'s local recovery never runs.
 *
 * This hook runs on auth-ready and on every `app:resumed` event. It:
 *   1. Reads all `nb:pendingOrder:<uid>:<courseId>` keys we stored just before
 *      opening checkout.
 *   2. For each pending course, calls `recover-enrollment` (server-side: verifies
 *      the payment with Razorpay + finalizes enrollment via atomic RPC).
 *   3. On success, drops the local key + toasts the user.
 *
 * Idempotent. Rate-limited server-side (5 req / 60s per user). Silent on 404.
 */

const KEY_PREFIX = "nb:pendingOrder:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — after that, likely abandoned

interface PendingOrder {
  courseId: string;
  key: string;
  ts: number;
}

function readPendingOrders(uid: string): PendingOrder[] {
  const orders: PendingOrder[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${KEY_PREFIX}${uid}:`)) continue;
      const courseId = key.slice(`${KEY_PREFIX}${uid}:`.length);
      let ts = 0;
      try {
        const raw = localStorage.getItem(key);
        if (raw) ts = JSON.parse(raw)?.ts ?? 0;
      } catch { /* ignore parse errors */ }
      orders.push({ courseId, key, ts });
    }
  } catch { /* localStorage unavailable */ }
  return orders;
}

async function reconcileOne(uid: string, order: PendingOrder): Promise<boolean> {
  // Skip stale entries (>24h old — Razorpay auto-refunds by then).
  if (order.ts && Date.now() - order.ts > MAX_AGE_MS) {
    try { localStorage.removeItem(order.key); } catch { /* ignore */ }
    return false;
  }

  // Fast path: already enrolled? Just clear the key.
  try {
    const { data: existing } = await supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", uid)
      .eq("course_id", Number(order.courseId))
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      try { localStorage.removeItem(order.key); } catch { /* ignore */ }
      return false;
    }
  } catch { /* fall through to server */ }

  // Ask server to reconcile via Razorpay API + atomic RPC.
  // 404 (no captured payment yet) / 429 (rate-limited) are normalised to
  // "not-yet" by recoverEnrollment — never thrown, so no unhandled rejection.
  const outcome = await recoverEnrollment(Number(order.courseId));
  if (outcome === "recovered") {
    try { localStorage.removeItem(order.key); } catch { /* ignore */ }
    addBreadcrumb("payments", "enrollment auto-recovered", { courseId: order.courseId });
    return true;
  }
  if (outcome === "failed") {
    reportError(new Error("recover-enrollment failed"), {
      surface: "useEnrollmentRecovery", courseId: order.courseId,
    });
  }
  return false;
}

export function useEnrollmentRecovery(): void {
  const { user } = useAuth();
  const uid = user?.id;

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    const sweep = async () => {
      const orders = readPendingOrders(uid);
      if (orders.length === 0) return;
      let recovered = 0;
      for (const o of orders) {
        if (cancelled) return;
        const ok = await reconcileOne(uid, o);
        if (ok) recovered++;
      }
      if (recovered > 0 && !cancelled) {
        toast.success(
          recovered === 1
            ? "🎉 Enrollment recovered from your recent payment!"
            : `🎉 ${recovered} enrollments recovered from recent payments!`,
        );
      }
    };

    // Boot sweep — delayed slightly so we don't race the auth handshake or
    // burn credits on cold-start when everything is already in order.
    const bootTimer = window.setTimeout(sweep, 1500);
    const onResumed = () => { void sweep(); };
    window.addEventListener("app:resumed", onResumed);

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      window.removeEventListener("app:resumed", onResumed);
    };
  }, [uid]);
}
