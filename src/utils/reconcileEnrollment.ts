/**
 * Waits for a paid enrollment to land, without ever tripping the server's
 * rate limiter.
 *
 * WHY THIS FILE EXISTS
 * `recover-enrollment` is rate limited in Postgres to **5 calls / 60 s per
 * user** (`check_rate_limit`, bucket `recover-enrollment`). Both pollers used
 * to fire every 3 s, so calls 6..15 came back 429 — normalised to `not-yet` by
 * `recoverEnrollmentDetailed` and therefore invisible. The advertised "~45 s
 * recovery window" was in reality a ~15 s window followed by 30 s of silently
 * rejected requests, which is exactly the window a slow UPI settlement misses.
 *
 * The schedule below keeps at most 4 calls inside any rolling 60 s window
 * while stretching coverage to ~5 minutes, and a 429 (should one still slip
 * through, e.g. two devices) buys a full extra minute instead of burning an
 * attempt.
 *
 * SECURITY: this grants nothing. `razorpay-webhook` (HMAC verified) and the
 * idempotent `complete_paid_enrollment` RPC are the only things that enroll a
 * student; this is purely "ask the server whether it happened yet".
 */
import { recoverEnrollmentDetailed, type RecoverOutcome } from "@/utils/paymentApi";

/**
 * Delay BEFORE each attempt, in ms. Attempt times: 0, 5s, 17s, 47s, 107s, …
 *
 * The first three attempts are front-loaded because a UPI capture webhook
 * usually lands within ~10 s — that is the window a student is actually
 * staring at the screen. Still ≤4 calls in any rolling 60 s window, so the
 * server's 5/60 s limit is never tripped, and coverage still reaches ~5 min.
 */
export const RECONCILE_SCHEDULE_MS = [
  0, 5000, 12000, 30000, 60000, 60000, 60000, 60000,
] as const;

/** Extra wait after a 429 so the rate-limit window can drain. */
const RATE_LIMITED_COOLDOWN_MS = 60_000;

export interface ReconcileOptions {
  /** Returns true to abort (unmounted, user navigated away). */
  isCancelled?: () => boolean;
  /** Called once before the first server call — good place for a toast. */
  onFirstAttempt?: () => void;
}

export type ReconcileResult = "recovered" | "not-yet" | "cancelled";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const waitForEnrollment = async (
  courseId: number,
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> => {
  const cancelled = () => opts.isCancelled?.() === true;
  let announced = false;
  // Bounded, so a permanently rate-limited device still finishes instead of
  // looping forever on the same attempt.
  let rateLimitRetries = 0;

  for (let attempt = 0; attempt < RECONCILE_SCHEDULE_MS.length; attempt++) {
    if (cancelled()) return "cancelled";
    const wait = RECONCILE_SCHEDULE_MS[attempt];
    if (wait > 0) await sleep(wait);
    if (cancelled()) return "cancelled";

    if (!announced) {
      announced = true;
      opts.onFirstAttempt?.();
    }

    const result = await recoverEnrollmentDetailed(courseId);
    if (cancelled()) return "cancelled";

    if (result.outcome === "recovered") return "recovered";

    // 429 means "we asked too often", not "no payment". Never let it eat an
    // attempt — wait out the window and retry the same step.
    if (result.status === 429 && rateLimitRetries < 3) {
      rateLimitRetries++;
      await sleep(RATE_LIMITED_COOLDOWN_MS);
      attempt--;
      continue;
    }
  }

  return "not-yet";
};

export type { RecoverOutcome };
