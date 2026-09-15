// Shared helper: POST to Lovable AI Gateway with bounded retries for genuinely
// transient failures only. Authentication failures are terminal: retrying the
// same rejected key cannot repair it and only makes the user wait longer.
//
// Recurring signature this defends against:
//   403 { "type": "lovable_api_key_not_registered" }
// which happens for a few seconds after LOVABLE_API_KEY rotation while the
// new secret propagates to Edge Function env.
//
// See mem://features/ai-doubt.md for the incident playbook.

export interface GatewayCallOpts {
  apiKey: string;
  body: unknown;
  // Attempts includes the first try. Default 3 (2 retries).
  attempts?: number;
  timeoutMs?: number;
}

/** Currently supported chat models for this project. */
export const DEFAULT_CHAT_MODEL = "google/gemini-3.6-flash";
export const SUPPORTED_CHAT_MODELS = [
  "google/gemini-3.6-flash",
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.1-pro-preview",
] as const;

/**
 * Only these upstream signatures mean the gateway credential itself is broken.
 * The word "unauthorized" appearing anywhere in provider prose is NOT enough —
 * that false positive is what showed students "server key issue" while the key
 * was healthy.
 */
export function isGatewayAuthFailure(status: number, upstreamBody: string): boolean {
  if (status !== 401 && status !== 403) return false;
  const text = upstreamBody || "";
  return (
    text.includes("lovable_api_key_not_registered") ||
    text.includes("lovable_api_key_registry_lookup_failed") ||
    /"type"\s*:\s*"unauthorized"/.test(text)
  );
}

/** A 400/404 that means "this model id is wrong", not "the request is broken". */
export function isModelRejection(status: number, upstreamBody: string): boolean {
  if (status !== 400 && status !== 404) return false;
  return /model/i.test(upstreamBody || "");
}

export async function callAiGateway(opts: GatewayCallOpts): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const timeoutMs = Math.max(5000, opts.timeoutMs ?? 18000);
  let last: Response | null = null;

  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Lovable-API-Key": opts.apiKey,
          "X-Lovable-AIG-SDK": "edge-function",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(opts.body),
        signal: ctrl.signal,
      });
    } catch (error) {
      if (i === attempts - 1) {
        return new Response(JSON.stringify({ error: "gateway_timeout", message: (error as Error)?.message || "AI request timed out" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        });
      }
      await new Promise((r) => setTimeout(r, 700 + Math.floor(Math.random() * 300)));
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) return res;

    // Peek at the body to decide if the failure is retryable.
    const text = await res.clone().text().catch(() => "");
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);

    last = res;
    if (!retryable || i === attempts - 1) return res;

    // Short exponential backoff with jitter. This stays below the Edge
    // Function request budget while giving transient upstream failures time
    // to recover.
    const wait = 700 * 2 ** i + Math.floor(Math.random() * 350);
    await new Promise((r) => setTimeout(r, wait));
  }

  return last!;
}
