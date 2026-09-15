/**
 * pdf-proxy 401 retry-with-refresh.
 *
 * pdf-proxy URLs carry the caller's Supabase access token in `?token=…`
 * (see src/lib/pdfViewerUrl.ts) because pdf.js loads them from a worker/
 * iframe that can't set request headers. When the token expires between
 * URL construction and fetch, the edge function returns 401 and the PDF
 * fails to open even though the user's session is fine — one refresh is
 * enough to unstick it.
 *
 * This helper:
 *   • only retries on HTTP 401 for URLs that look like pdf-proxy;
 *   • dedupes concurrent refreshes via a module-level in-flight promise
 *     so N parallel PDFs share ONE `supabase.auth.refreshSession()` call;
 *   • rewrites the `token=` query param with the fresh access token and
 *     retries the fetch exactly once;
 *   • on refresh failure or second-attempt 401, throws the original 401
 *     so `pdfErrors.classifyPdfError` can surface it as `Unauthorized`.
 *
 * No behaviour change on 2xx responses — the first fetch is returned
 * untouched.
 */
import { supabase } from "@/integrations/supabase/client";
import { addBreadcrumb } from "./sentry";

const PDF_PROXY_RE = /\/pdf-proxy(?:\?|$)/i;

let refreshInFlight: Promise<string | null> | null = null;

/** Refresh the Supabase session, deduplicated across concurrent callers. */
async function refreshAccessTokenOnce(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    } catch {
      return null;
    } finally {
      // Clear on next tick so callers that raced in during the refresh
      // still receive the same in-flight promise, but the NEXT 401 (much
      // later) can trigger a fresh refresh if needed.
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}

/** Replace or append `token=<newToken>` on a URL, preserving other params. */
function rewriteTokenParam(url: string, newToken: string): string {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : "http://x/");
    u.searchParams.set("token", newToken);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    const stripped = url.replace(/([?&])token=[^&]*(&|$)/, (_m, p1, p2) => (p2 ? p1 : ""));
    return `${stripped}${stripped.includes("?") ? "&" : sep}token=${encodeURIComponent(newToken)}`;
  }
}

/**
 * Fetch a URL with a one-shot 401-refresh retry for pdf-proxy URLs.
 * For non-pdf-proxy URLs, behaves exactly like `fetch`.
 */
export async function fetchWithAuthRetry(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 401 || !PDF_PROXY_RE.test(url)) return first;

  const fresh = await refreshAccessTokenOnce();
  addBreadcrumb("pdf", "pdf-proxy:401-refresh", { ok: !!fresh });
  if (!fresh) return first; // caller sees the original 401 → Unauthorized

  const retriedUrl = rewriteTokenParam(url, fresh);
  const retry = await fetch(retriedUrl, init);
  addBreadcrumb("pdf", "pdf-proxy:retry", { status: retry.status });
  return retry;
}

// Test-only reset (imported by pdfAuthRetry.test.ts).
export function __resetForTests(): void {
  refreshInFlight = null;
}
