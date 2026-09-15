/**
 * Standard error envelope shared across edge functions.
 *
 * Shape: { error: { code, message, details? } }
 *
 * - `code` is a stable machine-readable identifier the client can switch on.
 * - `message` is a safe, generic string suitable for surface in UI toasts.
 * - Internal exception details are never leaked to callers — they log
 *   server-side and the client receives INTERNAL_ERROR.
 *
 * Callers already tolerate this shape (see `useEnrollments` mapping).
 */

export type ErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFIG_MISSING"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: "Invalid request",
  UNAUTHORIZED: "Authentication required",
  FORBIDDEN: "Not allowed",
  NOT_FOUND: "Not found",
  RATE_LIMITED: "Too many requests, please try again shortly",
  CONFIG_MISSING: "Service temporarily unavailable",
  UPSTREAM_ERROR: "Upstream service failed",
  INTERNAL_ERROR: "Something went wrong",
};

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  CONFIG_MISSING: 503,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export function errorResponse(
  code: ErrorCode,
  corsHeaders: Record<string, string>,
  opts?: { message?: string; status?: number; details?: unknown },
): Response {
  const body = {
    error: {
      code,
      message: opts?.message ?? DEFAULT_MESSAGES[code],
      ...(opts?.details !== undefined ? { details: opts.details } : {}),
    },
  };
  return new Response(JSON.stringify(body), {
    status: opts?.status ?? DEFAULT_STATUS[code],
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Wrap an unknown thrown value: log the full detail server-side, return a
 * masked INTERNAL_ERROR envelope. Never echo raw messages to the client —
 * upstream stack traces and provider errors can leak keys or PII.
 */
export function internalError(
  err: unknown,
  corsHeaders: Record<string, string>,
  scope: string,
): Response {
  console.error(`[${scope}] internal error:`, err);
  return errorResponse("INTERNAL_ERROR", corsHeaders);
}
