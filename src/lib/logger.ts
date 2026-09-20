/**
 * Structured logger — thin wrapper over `console` + Sentry.
 *
 * Why: 174 bare `console.error` calls across 81 files are cluster-blind in
 * production. Bugs surface in Sentry only when a caller happens to import
 * `captureException` from `@/lib/sentry`. This module makes structured
 * logging the default: every `logger.error` fans out to `console.error`
 * (dev + prod for local debugging) AND `Sentry.captureException` (prod
 * only, gated by DSN via `sentry.ts`).
 *
 * API:
 *   logger.error(message, error?, context?)  → console.error + Sentry
 *   logger.warn(message, context?)           → console.warn
 *   logger.info(message, context?)           → console.info (dev only)
 *   logger.debug(message, context?)          → console.debug (dev only)
 *
 * Context is an arbitrary key/value bag serialized into Sentry's `extra`.
 * Never put secrets / auth tokens / PII in the context — Sentry retains it.
 *
 * Migrate `console.error(x, y)` → `logger.error("what failed", y, { x })`
 * so the Sentry title stays stable across occurrences (needed for grouping).
 */
import { captureException } from "./sentry";

type Context = Record<string, unknown>;

const isDev = import.meta.env.DEV;

function toError(input: unknown): Error {
  if (input instanceof Error) return input;
  if (typeof input === "string") return new Error(input);
  try {
    return new Error(JSON.stringify(input));
  } catch {
    return new Error(String(input));
  }
}

/**
 * A plain `{ key: value }` bag (not an Error, not a class instance). Callers
 * regularly write `logger.error("x failed", { courseId })` — context in the
 * error slot — which used to ship `{"courseId":34}` as the Sentry title
 * (SAFAR-ENGLISH-APP-17). Detect that and treat it as context instead.
 */
function isPlainContext(v: unknown): v is Context {
  if (v === null || typeof v !== "object") return false;
  if (v instanceof Error) return false;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return false;
  const o = v as Record<string, unknown>;
  // Error-like objects (Supabase PostgrestError, FunctionsError JSON) carry
  // message/code/details — keep those as the error so Sentry sees the cause.
  if (typeof o.message === "string" || typeof o.code === "string" || "details" in o) return false;
  return true;
}

export const logger = {
  /**
   * Log an error. Always writes to console; forwards to Sentry in prod when
   * the DSN is configured. Use a stable, human-readable `message` — it drives
   * Sentry issue grouping.
   */
  error(message: string, error?: unknown, context?: Context): void {
    if (context === undefined && isPlainContext(error)) {
      context = error;
      error = undefined;
    }
     
    console.error(`[error] ${message}`, error ?? "", context ?? "");
    const err = error !== undefined ? toError(error) : new Error(message);
    captureException(err, { message, ...(context ?? {}) });
  },

  warn(message: string, context?: Context): void {
     
    console.warn(`[warn] ${message}`, context ?? "");
  },

  info(message: string, context?: Context): void {
    if (!isDev) return;
     
    console.info(`[info] ${message}`, context ?? "");
  },

  debug(message: string, context?: Context): void {
    if (!isDev) return;
     
    console.debug(`[debug] ${message}`, context ?? "");
  },
};
