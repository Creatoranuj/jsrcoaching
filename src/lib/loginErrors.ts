/**
 * Login resilience helpers (audit 2026-09-24, Supabase cold start / 504).
 *
 * When the Auth service is waking up (free-tier pause / restart) the gateway
 * answers 502/503/504 with a non-JSON body. gotrue-js turns that into an
 * `AuthRetryableFetchError` whose message is literally `"{}"`, and without a
 * client-side deadline the "Signing in..." button spins until the WebView
 * gives up (60-120 s). Both make students think their password is wrong and
 * re-register. These helpers give the login form a calm, honest fallback.
 */

/** Client-side deadline for one sign-in attempt. */
export const LOGIN_TIMEOUT_MS = 25_000;

export const SERVER_WAKING_MESSAGE =
  "Server jaag raha hai — 30-60 second baad dobara try karo. Aapka email/password galat nahi hai.";

export const LOGIN_TIMEOUT_MESSAGE =
  "Login me zyada der lag rahi hai — server shayad jaag raha hai. Thodi der baad Retry dabao; naya account mat banao.";

export class LoginTimeoutError extends Error {
  constructor() {
    super("login_timeout");
    this.name = "LoginTimeoutError";
  }
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_TEXT = /\b(502|503|504)\b|bad gateway|service unavailable|gateway time-?out|upstream/;

/**
 * True when the auth error means "the server is not ready", not "wrong
 * credentials" or "you are offline". Offline (`status === 0`) is left to the
 * existing network-error copy.
 */
export function isRetryableAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; status?: unknown; message?: unknown };
  if (typeof e.status === "number") {
    if (RETRYABLE_STATUSES.has(e.status)) return true;
    if (e.status === 0) return false;
  }
  if (e.name === "AuthRetryableFetchError") return true;
  const msg = typeof e.message === "string" ? e.message.trim().toLowerCase() : "";
  // gotrue-js stringifies a non-JSON 5xx Response as "{}".
  if (msg === "{}") return true;
  return RETRYABLE_TEXT.test(msg);
}

/**
 * Race a sign-in call against a deadline. The underlying request is not
 * cancelled: if it succeeds late, `onAuthStateChange` still signs the user in.
 */
export function withLoginTimeout<T>(
  attempt: Promise<T>,
  ms: number = LOGIN_TIMEOUT_MS,
): Promise<T | { error: LoginTimeoutError }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ error: LoginTimeoutError }>((resolve) => {
    timer = setTimeout(() => resolve({ error: new LoginTimeoutError() }), ms);
  });
  return Promise.race([attempt, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
