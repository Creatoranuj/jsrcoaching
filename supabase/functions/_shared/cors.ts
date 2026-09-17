// Shared CORS helper.
//
// Behaviour:
// - Auto-allow Lovable preview/prod origins (*.lovable.app, *.lovableproject.com)
//   and localhost, so preview + published apps work without extra config.
// - If ALLOWED_ORIGINS secret is set (comma-separated), those are also honored.
// - If neither the pattern nor ALLOWED_ORIGINS matches, fall back to the first
//   allowed origin (never `*` in production) — or `*` when nothing is configured.
// - Always sets `Vary: Origin` so CDNs don't cross-cache responses.
//
// Usage:
//   const corsHeaders = buildCorsHeaders(req);
//   if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
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

const AUTO_ALLOW_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.dev$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
  // Production web host (Vercel) + this project's preview deployments only.
  // Without this the helper falls back to ALLOWED[0] as soon as
  // ALLOWED_ORIGINS is set, which would break every payment call from the
  // live website.
  //
  // AUDIT 2026-08-03 [M1]: the previous `*.vercel.app` wildcard trusted every
  // Vercel-hosted site on the internet as an origin for payment endpoints.
  // Scoped down to this project's deployment names.
  // AUDIT 2026-09-17: the pre-rebrand project names (`sadguruclasses`,
  // `safarenglishka`) are retired. They are no longer listed — the live site is
  // `jsrcoaching.vercel.app`. Also see `buildCorsHeaders`: an unrecognised
  // origin is now echoed back instead of falling back to ALLOWED[0] (which was
  // a retired domain, so the browser rejected every response and students only
  // saw "Failed to send a request to the Edge Function").
  /^https:\/\/jsrcoaching\.vercel\.app$/i,
  /^https:\/\/jsrcoaching-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*jsrcoaching\.com$/i,
  // Capacitor Android WebView with androidScheme: 'https' loads the app from
  // https://localhost, so its Origin header is exactly that. Without this
  // pattern, every supabase.functions.invoke() from the APK was falling back
  // to ALLOWED[0] and the browser rejected the response → user saw the
  // generic "Failed to send a request to the Edge Function" toast on every
  // lesson / PDF / DPP open.
  /^https:\/\/localhost(:\d+)?$/i,
  /^capacitor:\/\/localhost$/i,
  /^ionic:\/\/localhost$/i,
];

function isAutoAllowed(origin: string): boolean {
  return AUTO_ALLOW_PATTERNS.some((re) => re.test(origin));
}

export function isOriginAllowed(origin: string): boolean {
  return !!origin && (isAutoAllowed(origin) || ALLOWED.includes(origin));
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const known = isOriginAllowed(origin);

  // Echo the caller's origin. Falling back to a configured origin (previously a
  // retired domain) made the browser discard the response, which surfaced to
  // students as "Failed to send a request to the Edge Function" on every doubt.
  // CORS is not the security boundary here — `_shared/auth.ts` verifies the
  // caller's JWT before anything sensitive happens.
  const allowOrigin = origin || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
    // Diagnostic only: lets us spot an unexpected origin in logs without
    // breaking a legitimate deployment.
    "X-Origin-Known": known ? "1" : "0",
  };
}
