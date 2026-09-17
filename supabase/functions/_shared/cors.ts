// Shared CORS helper — single source of truth for which websites may talk to
// these functions.
//
// Behaviour:
// - `SITE_ORIGINS` below is the ONE place to add/remove a site origin.
// - Extra origins can be appended at runtime via the `ALLOWED_ORIGINS` secret
//   (comma-separated). It can only ADD origins; it can never redirect or
//   override the canonical list.
// - Unknown origin => NO `Access-Control-Allow-Origin` header at all. The
//   browser then blocks the response, which is the intended, explicit answer.
//   We never echo an unknown origin (that would let any site read responses)
//   and we never fall back to some other configured origin (that silently broke
//   the live site when the fallback pointed at a retired domain — the root
//   cause of the "Failed to send a request to the Edge Function" outage,
//   AUDIT 2026-09-17).
// - Always sets `Vary: Origin` so CDNs don't cross-cache responses.
//
// Usage:
//   const corsHeaders = buildCorsHeaders(req);
//   if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

/**
 * SINGLE SOURCE OF TRUTH for allowed site origins.
 * Add a new domain here (and nowhere else) when the website moves.
 * Retired: sadguruclasses.*, safarenglishka.* (pre-rebrand names).
 */
export const SITE_ORIGINS: RegExp[] = [
  // Live website (Vercel) + this project's preview deployments only.
  /^https:\/\/jsrcoaching\.vercel\.app$/i,
  /^https:\/\/jsrcoaching-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*jsrcoaching\.com$/i,
  // Lovable preview / published hosts.
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.dev$/i,
  // Local development.
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
  // Capacitor Android WebView (androidScheme: 'https' loads from https://localhost).
  /^https:\/\/localhost(:\d+)?$/i,
  /^capacitor:\/\/localhost$/i,
  /^ionic:\/\/localhost$/i,
];

// Optional additive allow-list from the environment. Additive only.
const EXTRA_ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Keep in sync with headers sent by @supabase/supabase-js. Newer versions
// (>=2.108) send `x-supabase-api-version`; missing it breaks preflight.
const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, " +
  "x-supabase-api-version, " +
  "x-supabase-client-platform, x-supabase-client-platform-version, " +
  "x-supabase-client-runtime, x-supabase-client-runtime-version, " +
  "range";

export function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  return SITE_ORIGINS.some((re) => re.test(origin)) ||
    EXTRA_ALLOWED.includes(origin);
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const known = isOriginAllowed(origin);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
    // Diagnostic only: lets us spot an unexpected origin in logs.
    "X-Origin-Known": known ? "1" : "0",
  };

  // Only a recognised origin gets an allow header. No fallback, no wildcard.
  if (known) headers["Access-Control-Allow-Origin"] = origin;

  return headers;
}
