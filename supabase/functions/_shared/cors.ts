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
  /^https:\/\/sadguruclasses\.vercel\.app$/i,
  /^https:\/\/sadguruclasses-[a-z0-9-]+\.vercel\.app$/i,
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

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin: string;

  if (origin && (isAutoAllowed(origin) || ALLOWED.includes(origin))) {
    allowOrigin = origin;
  } else if (ALLOWED.length > 0) {
    allowOrigin = ALLOWED[0];
  } else {
    allowOrigin = "*";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}
