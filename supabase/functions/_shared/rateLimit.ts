// Shared per-user rate limiter backed by public.check_rate_limit RPC.
// Edge-runtime isolates don't share memory, so in-memory maps are ineffective.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let cachedAdmin: ReturnType<typeof createClient> | null = null;
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

/** Returns true when the caller is over the limit. Fails open on RPC error. */
export async function isRateLimited(opts: RateLimitOptions): Promise<boolean> {
  try {
    const { data, error } = await admin().rpc("check_rate_limit", {
      _bucket: opts.bucket,
      _user_id: opts.userId,
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
