// Shared Razorpay API fetch with retry + exponential backoff.
//
// Razorpay's API occasionally returns 5xx / times out. A single failed call
// used to surface as a hard 500 to the client even though the payment was
// almost certainly captured. We retry transient failures a few times and, when
// everything fails, callers should return a *retryable* 503 so the client can
// fall back to `recover-enrollment` / the webhook instead of showing
// "payment failed".

export interface RazorpayFetchResult {
  ok: boolean;
  /** Present when a response was received (even a non-2xx one). */
  status?: number;
  /** Parsed JSON body when ok. */
  data?: any;
  /** Raw body text for non-ok responses (truncated). */
  bodyText?: string;
  /** Set when every attempt failed at the network level. */
  networkError?: string;
  /** True when the failure looks transient — caller should return 503. */
  retryable: boolean;
  attempts: number;
}

const DEFAULT_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;
const TIMEOUT_MS = 8000;

const isTransientStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function razorpayAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

/**
 * Fetch a Razorpay API endpoint with retry/backoff on transient failures.
 * Non-transient responses (4xx other than 408/429) return immediately.
 */
export async function razorpayFetchWithRetry(
  url: string,
  init: RequestInit & { attempts?: number } = {},
): Promise<RazorpayFetchResult> {
  const attempts = init.attempts ?? DEFAULT_ATTEMPTS;
  let lastStatus: number | undefined;
  let lastBody: string | undefined;
  let lastNetworkError: string | undefined;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      // Exponential backoff with jitter: ~250ms, ~500ms, ~1000ms
      const delay = BASE_DELAY_MS * 2 ** (i - 1);
      await sleep(delay + Math.floor(Math.random() * 120));
    }

    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) {
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        return { ok: true, status: res.status, data, retryable: false, attempts: i + 1 };
      }

      lastStatus = res.status;
      lastBody = (await res.text().catch(() => "")).slice(0, 500);

      if (!isTransientStatus(res.status)) {
        // Permanent error — no point retrying.
        return {
          ok: false,
          status: res.status,
          bodyText: lastBody,
          retryable: false,
          attempts: i + 1,
        };
      }
      console.warn(
        `Razorpay transient failure (attempt ${i + 1}/${attempts}) status=${res.status}`,
      );
    } catch (e) {
      lastNetworkError = e instanceof Error ? e.message : String(e);
      console.warn(
        `Razorpay network failure (attempt ${i + 1}/${attempts}): ${lastNetworkError}`,
      );
    }
  }

  return {
    ok: false,
    status: lastStatus,
    bodyText: lastBody,
    networkError: lastNetworkError,
    retryable: true,
    attempts,
  };
}
