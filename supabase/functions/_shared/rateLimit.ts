// Shared per-user rate limiter backed by public.check_rate_limit RPC.
// Edge-runtime isolates don't share memory, so in-memory maps are ineffective.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Untyped on purpose: the edge runtime has no generated Database types, so the
// rpc() overloads would infer `never` for these custom functions.
// deno-lint-ignore no-explicit-any
let cachedAdmin: any = null;
function admin() {
  if (!cachedAdmin) {
    cachedAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return cachedAdmin;
}

export interface RateLimitOptions {
  bucket: string;
  userId: string;
  max: number;
  windowSeconds: number;
}

/**
 * Returns true when the caller is over the limit.
 *
 * AUDIT 2026-09-17: this used to FAIL OPEN — an RPC error let every request
 * through, so anyone who could make the rate_limits table error out got an
 * unlimited endpoint. It now fails CLOSED: only an explicit `true` from the
 * RPC counts as allowed.
 */
export async function isRateLimited(opts: RateLimitOptions): Promise<boolean> {
  try {
    const { data, error } = await admin().rpc("check_rate_limit", {
      _bucket: opts.bucket,
      _user_id: opts.userId,
      _max: opts.max,
      _window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.error(`[rateLimit:${opts.bucket}] rpc error — failing closed`, error.message);
      return true;
    }
    return data !== true;
  } catch (e) {
    console.error(`[rateLimit:${opts.bucket}] failed — failing closed`, (e as Error).message);
    return true;
  }
}

export interface TextRateLimitOptions {
  bucket: string;
  identifier: string;
  max: number;
  windowSeconds: number;
}

/**
 * Rate limit by an arbitrary string key (IP, email) for endpoints that run
 * before any user exists — e.g. admin registration, OTP send. Backed by
 * public.check_rate_limit_text.
 *
 * AUDIT 2026-09-17: admin-register had no throttle at all, so the admin code
 * could be brute-forced as fast as the network allowed.
 *
 * Returns true when the caller is over the limit. Fails open on RPC error.
 */
export async function isRateLimitedByKey(opts: TextRateLimitOptions): Promise<boolean> {
  try {
    const { data, error } = await admin().rpc("check_rate_limit_text", {
      _bucket: opts.bucket,
      _identifier: opts.identifier,
      _max: opts.max,
      _window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.error(`[rateLimit:${opts.bucket}] rpc error`, error.message);
      return false;
    }
    return data === false;
  } catch (e) {
    console.error(`[rateLimit:${opts.bucket}] failed`, (e as Error).message);
    return false;
  }
}

/** Standard 429 response with CORS headers. */
export function rateLimitedResponse(corsHeaders: Record<string, string>, retryAfterSec = 60) {
  return new Response(
    JSON.stringify({ error: "Rate limited. Please wait a moment and try again." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
