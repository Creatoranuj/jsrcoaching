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
 * TWO CHANNELS, ONE ANSWER (2026-09-21)
 * The webhook usually enrolls the student within ~10 s of capture, but the
 * *screen* only found out when the next rate-limited `recover-enrollment`
 * call happened to run — and when that budget was spent by another surface
 * (global sweep, resume poller) the student sat on "Enrollment confirm ho
 * raha hai" for minutes with the course already unlocked. The recordings from
 * 2026-09-21 show exactly that. So every wait is now interleaved with a cheap
 * direct read of the student's own `enrollments` row (RLS-scoped, no rate
 * limit, ~200 bytes). The moment the webhook writes the row, the screen moves.
 *
 * SECURITY: this grants nothing. `razorpay-webhook` (HMAC verified) and the
 * idempotent `complete_paid_enrollment` RPC are the only things that enroll a
 * student; this is purely "ask the server whether it happened yet".
 */
import { recoverEnrollmentDetailed, type RecoverOutcome } from "@/utils/paymentApi";
import { invalidateEnrollmentsCache } from "@/hooks/useEnrollments";
import { supabase } from "@/integrations/supabase/client";

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

/**
 * How often the direct `enrollments` read runs while a poller is sleeping
 * between rate-limited recovery calls. Cheap enough to run every few seconds;
 * it is the channel that actually moves the screen once the webhook lands.
 */
export const DIRECT_CHECK_INTERVAL_MS = 3000;

/**
 * Window event fired the moment ANY surface learns that a course got unlocked
 * (direct read, recovery call, verify). Screens that are showing a "Pay" or
 * "confirm ho raha hai" state listen for it and move on, so a student is
 * never left looking at an active Pay button for a course they already own.
 */
export const ENROLLMENT_LANDED_EVENT = "nb:enrollment-landed";

export type EnrollmentLandedSource = "direct" | "recovery" | "verify" | "sweep";

export interface EnrollmentLandedDetail {
  courseId: number;
  source: EnrollmentLandedSource;
}

export const announceEnrollmentLanded = (
  courseId: number,
  source: EnrollmentLandedSource,
): void => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<EnrollmentLandedDetail>(ENROLLMENT_LANDED_EVENT, {
        detail: { courseId, source },
      }),
    );
  } catch {
    /* CustomEvent unavailable (very old WebView) — listeners simply poll. */
  }
};

/** Subscribe to {@link ENROLLMENT_LANDED_EVENT} for one course. */
export const onEnrollmentLanded = (
  courseId: number,
  cb: (detail: EnrollmentLandedDetail) => void,
): (() => void) => {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<EnrollmentLandedDetail>).detail;
    if (detail && Number(detail.courseId) === Number(courseId)) cb(detail);
  };
  window.addEventListener(ENROLLMENT_LANDED_EVENT, handler);
  return () => window.removeEventListener(ENROLLMENT_LANDED_EVENT, handler);
};

const resolveUserId = async (explicit?: string | null): Promise<string | null> => {
  if (explicit) return explicit;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Direct, RLS-scoped read: does THIS student already own THIS course?
 *
 * Never throws — a network blip returns `false` so the caller keeps waiting.
 * Costs no `recover-enrollment` budget, so it can run every few seconds.
 * Deliberately filters by `user_id` even though RLS already scopes the read:
 * an admin account has a wider policy and must not see another student's row
 * as its own.
 */
export const hasActiveEnrollment = async (
  courseId: number,
  userId?: string | null,
): Promise<boolean> => {
  const uid = await resolveUserId(userId);
  if (!uid || !Number.isFinite(courseId)) return false;
  try {
    const { data, error } = await supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", uid)
      .eq("course_id", courseId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.id);
  } catch {
    return false;
  }
};

export interface ReconcileOptions {
  /** Returns true to abort (unmounted, user navigated away). */
  isCancelled?: () => boolean;
  /** Called once before the first server call — good place for a toast. */
  onFirstAttempt?: () => void;
  /**
   * Student id when the caller already has it (saves a session lookup). When
   * omitted the current session is used; when there is no session the direct
   * channel is skipped and only `recover-enrollment` runs.
   */
  userId?: string | null;
}

export type ReconcileResult = "recovered" | "not-yet" | "cancelled";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const landed = (courseId: number, source: EnrollmentLandedSource): "recovered" => {
  // The student just got the course — drop the shared 60s list cache so
  // every screen shows it immediately, and tell every open screen.
  invalidateEnrollmentsCache();
  announceEnrollmentLanded(courseId, source);
  return "recovered";
};

/**
 * Sleeps `ms`, but wakes early with `true` as soon as the direct read sees
 * the enrollment row. Returns `false` when the full wait elapsed.
 */
const sleepWatchingEnrollment = async (
  ms: number,
  courseId: number,
  userId: string | null | undefined,
  cancelled: () => boolean,
): Promise<boolean> => {
  let remaining = ms;
  while (remaining > 0) {
    const chunk = Math.min(DIRECT_CHECK_INTERVAL_MS, remaining);
    await sleep(chunk);
    remaining -= chunk;
    if (cancelled()) return false;
    if (await hasActiveEnrollment(courseId, userId)) return true;
    if (cancelled()) return false;
  }
  return false;
};

export const waitForEnrollment = async (
  courseId: number,
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> => {
  const cancelled = () => opts.isCancelled?.() === true;
  let announced = false;
  // Bounded, so a permanently rate-limited device still finishes instead of
  // looping forever on the same attempt.
  let rateLimitRetries = 0;

  // Cheapest question first: the webhook may already have done the work
  // (browser UPI returns often arrive AFTER the capture webhook).
  if (cancelled()) return "cancelled";
  if (await hasActiveEnrollment(courseId, opts.userId)) return landed(courseId, "direct");

  for (let attempt = 0; attempt < RECONCILE_SCHEDULE_MS.length; attempt++) {
    if (cancelled()) return "cancelled";
    const wait = RECONCILE_SCHEDULE_MS[attempt];
    if (wait > 0) {
      const seen = await sleepWatchingEnrollment(wait, courseId, opts.userId, cancelled);
      if (cancelled()) return "cancelled";
      if (seen) return landed(courseId, "direct");
    }

    if (!announced) {
      announced = true;
      opts.onFirstAttempt?.();
    }

    const result = await recoverEnrollmentDetailed(courseId);
    if (cancelled()) return "cancelled";

    if (result.outcome === "recovered") return landed(courseId, "recovery");

    // 429 means "we asked too often", not "no payment". Never let it eat an
    // attempt — wait out the window (still watching the direct channel) and
    // retry the same step.
    if (result.status === 429 && rateLimitRetries < 3) {
      rateLimitRetries++;
      const seen = await sleepWatchingEnrollment(
        RATE_LIMITED_COOLDOWN_MS, courseId, opts.userId, cancelled,
      );
      if (cancelled()) return "cancelled";
      if (seen) return landed(courseId, "direct");
      attempt--;
      continue;
    }
  }

  return "not-yet";
};

export type { RecoverOutcome };
