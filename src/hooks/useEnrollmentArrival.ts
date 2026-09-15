import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { recoverEnrollment } from "@/utils/paymentApi";
import { logger } from "@/lib/logger";

const KEY_PREFIX = "nb:pendingOrder:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — Razorpay auto-refunds beyond this
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 5; // ~15s reconcile window

function safeRemove(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

/** Pending course ids written by BuyCourse right before opening checkout. */
function readPendingCourseIds(uid: string): number[] {
  const ids: number[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${KEY_PREFIX}${uid}:`)) continue;
      const raw = key.slice(`${KEY_PREFIX}${uid}:`.length);
      const courseId = Number(raw);
      if (!Number.isFinite(courseId)) { safeRemove(key); continue; }

      let ts = 0;
      try {
        const stored = localStorage.getItem(key);
        if (stored) ts = JSON.parse(stored)?.ts ?? 0;
      } catch { /* ignore parse errors */ }

      if (ts && Date.now() - ts > MAX_AGE_MS) { safeRemove(key); continue; }
      ids.push(courseId);
    }
  } catch { /* localStorage unavailable */ }
  return ids;
}

interface Options {
  userId: string | undefined;
  /** Course ids currently visible in My Courses. */
  enrolledCourseIds: number[];
  /** True while the initial list fetch is in flight. */
  loading: boolean;
  refetch: () => Promise<void> | void;
  onRecovered?: (courseId: number) => void;
}

/**
 * Arrival-time enrollment reconciliation for My Courses.
 *
 * A purchase can land here *before* the enrollment row exists: if
 * `verify-razorpay-payment` returned 503 (`razorpay_unreachable`) the webhook
 * finalizes the enrollment a few seconds later. Without this hook the page
 * renders an empty state and the user has no path forward but a manual refresh.
 *
 * Strategy (all guarded — a normal visit issues zero extra requests):
 *  1. Detect a pending purchase (router state `justPurchased` or a
 *     `nb:pendingOrder:<uid>:<courseId>` key).
 *  2. Ask the server to reconcile via the idempotent `recover-enrollment`
 *     function.
 *  3. Poll the list for ~15s until the course appears, then stop.
 *  4. A user-scoped realtime subscription on `enrollments` acts as a backstop
 *     so a late webhook updates the list with no polling at all.
 */
export function useEnrollmentArrival({
  userId,
  enrolledCourseIds,
  loading,
  refetch,
  onRecovered,
}: Options) {
  const location = useLocation();
  const justPurchased = (location.state as { justPurchased?: number } | null)?.justPurchased;

  const [reconciling, setReconciling] = useState(false);

  // Keep the latest values addressable from timers without re-arming effects.
  const enrolledRef = useRef(enrolledCourseIds);
  enrolledRef.current = enrolledCourseIds;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;

  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  /** Fire `recover-enrollment` for one course. Silent on the expected 404. */
  const recoverCourse = useCallback(async (courseId: number): Promise<boolean> => {
    const outcome = await recoverEnrollment(courseId);
    if (outcome === "failed") logger.error("recover-enrollment failed", { courseId });
    return outcome === "recovered";
  }, []);


  /** Manual "I paid but don't see my course" action for the empty state. */
  const recoverNow = useCallback(async (): Promise<"recovered" | "nothing" | "failed"> => {
    if (!userId) return "failed";
    const pending = readPendingCourseIds(userId);
    if (pending.length === 0) {
      await refetchRef.current();
      return "nothing";
    }
    setReconciling(true);
    let any = false;
    for (const courseId of pending) {
      if (await recoverCourse(courseId)) any = true;
    }
    await refetchRef.current();
    if (aliveRef.current) setReconciling(false);
    return any ? "recovered" : "failed";
  }, [userId, recoverCourse]);

  // ── 1+2+3: reconcile + bounded poll ─────────────────────────────────────
  const startedRef = useRef(false);
  useEffect(() => {
    if (!userId || loading || startedRef.current) return;

    const pending = new Set(readPendingCourseIds(userId));
    if (typeof justPurchased === "number") pending.add(justPurchased);
    if (pending.size === 0) return;

    // Everything already visible → just clear the keys, no network work.
    const missing = [...pending].filter((id) => !enrolledRef.current.includes(id));
    if (missing.length === 0) {
      pending.forEach((id) => safeRemove(`${KEY_PREFIX}${userId}:${id}`));
      return;
    }

    startedRef.current = true;
    let cancelled = false;
    let timer: number | null = null;

    const run = async () => {
      setReconciling(true);
      for (const courseId of missing) {
        if (cancelled) return;
        await recoverCourse(courseId);
      }
      if (cancelled) return;
      await refetchRef.current();

      let attempts = 0;
      const tick = async () => {
        if (cancelled || !aliveRef.current) return;
        const stillMissing = missing.filter((id) => !enrolledRef.current.includes(id));
        if (stillMissing.length === 0 || attempts >= MAX_POLLS) {
          missing
            .filter((id) => enrolledRef.current.includes(id))
            .forEach((id) => {
              safeRemove(`${KEY_PREFIX}${userId}:${id}`);
              onRecoveredRef.current?.(id);
            });
          if (aliveRef.current) setReconciling(false);
          return;
        }
        attempts += 1;
        await refetchRef.current();
        if (!cancelled) timer = window.setTimeout(tick, POLL_INTERVAL_MS);
      };

      timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    void run();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [userId, loading, justPurchased, recoverCourse]);

  // ── 4: realtime backstop ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`enrollments:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "enrollments",
          filter: `user_id=eq.${userId}`,
        },
        () => { void refetchRef.current(); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  return { reconciling, recoverNow };
}
