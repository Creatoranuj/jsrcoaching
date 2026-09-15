import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { recoverEnrollment } from "@/utils/paymentApi";
import { logger } from "@/lib/logger";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 15; // ~45s window for a late webhook

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
 * + query refetch). Self-limits to ~45s and issues zero extra requests on a
 * normal visit (no `payment=success` param).
 */
export function usePaymentSync({ courseId, hasPurchased, loading, refetch }: Options) {
  const [searchParams, setSearchParams] = useSearchParams();
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
    toast.success("🎉 Course unlocked — happy learning!");
    stripParam();
     
  }, [isPaymentReturn, hasPurchased]);

  // Reconcile loop — only while we're waiting for the webhook to land.
  useEffect(() => {
    if (!isPaymentReturn || hasPurchased || loading || !courseId) return;
    let cancelled = false;
    let polls = 0;
    let timer = 0;
    setSyncing(true);

    const tick = async () => {
      if (cancelled) return;
      polls += 1;
      try {
        await recoverEnrollment(courseId);
      } catch (err) {
        logger.warn("[payment-sync] recover failed", err);
      }
      if (cancelled) return;
      await refetchRef.current();
      if (cancelled) return;
      if (polls >= MAX_POLLS) {
        setSyncing(false);
        toast.info(
          "Still confirming your payment. If the amount was deducted, access unlocks automatically — please check back in a few minutes.",
        );
        stripParam();
        return;
      }
      timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
     
  }, [isPaymentReturn, hasPurchased, loading, courseId]);

  return { syncing: syncing && !hasPurchased };
}
