import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { waitForEnrollment } from "@/utils/reconcileEnrollment";
import { markEnrollmentChanged } from "@/lib/enrollmentFreshness";
import { clearPendingPayment } from "@/lib/pendingPayment";

interface Options {
  /** Course being opened right after checkout. */
  courseId: number | undefined;
  /** True once the enrollment row is visible to the client. */
  hasPurchased: boolean;
  /** True while the course query is still resolving. */
  loading: boolean;
  /** Re-runs the course/enrollment query. */
  refetch: () => Promise<unknown> | void;
}

/**
 * Post-checkout "Syncing your course…" gate.
 *
 * Access is NEVER granted from the frontend success callback. When the user
 * lands on `/my-courses/:id?payment=success`, this hook keeps a syncing state
 * on until the *server* confirms the enrollment (idempotent `recover-enrollment`
 * + query refetch). Zero extra requests on a normal visit (no `payment=success`).
 *
 * Polling goes through the shared `waitForEnrollment` schedule. The old
 * hand-rolled 3 s loop burned the server's 5 calls / 60 s rate limit inside
 * ~15 s, and every rejected call looked like "not enrolled yet" — the exact
 * window a slow UPI settlement misses.
 */
export function usePaymentSync({ courseId, hasPurchased, loading, refetch }: Options) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isPaymentReturn = searchParams.get("payment") === "success";

  const [syncing, setSyncing] = useState(isPaymentReturn);
  const celebratedRef = useRef(false);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

  // Clears the query param without a history entry so a refresh/back press
  // doesn't replay the celebration.
  const stripParam = () => {
    setSearchParamsRef.current(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("payment");
        return next;
      },
      { replace: true },
    );
  };

  // Success path — enrollment confirmed by the server.
  useEffect(() => {
    if (!isPaymentReturn || !hasPurchased || celebratedRef.current) return;
    celebratedRef.current = true;
    setSyncing(false);
    markEnrollmentChanged(courseId, user?.id);
    clearPendingPayment();
    toast.success("🎉 Course unlocked — happy learning!");
    stripParam();
     
  }, [isPaymentReturn, hasPurchased, courseId, user?.id]);

  // Reconcile loop — only while we're waiting for the webhook to land.
  useEffect(() => {
    if (!isPaymentReturn || hasPurchased || loading || !courseId) return;
    let cancelled = false;
    setSyncing(true);

    void (async () => {
      const result = await waitForEnrollment(courseId, {
        isCancelled: () => cancelled,
      });
      if (cancelled) return;
      if (result === "recovered") {
        markEnrollmentChanged(courseId, user?.id);
        clearPendingPayment();
        await refetchRef.current();
        return;
      }
      if (result === "cancelled") return;
      setSyncing(false);
      toast.info(
        "Still confirming your payment. If the amount was deducted, access unlocks automatically — please check back in a few minutes.",
      );
      stripParam();
    })();

    return () => {
      cancelled = true;
    };
     
  }, [isPaymentReturn, hasPurchased, loading, courseId, user?.id]);

  return { syncing: syncing && !hasPurchased };
}
