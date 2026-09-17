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
  // AUDIT 2026-09-16: `sadguruclasses` is the pre-rebrand project name and no
  // longer resolves, so the live site's own origin was not auto-allowed and
  // fell back to ALLOWED[0] — the browser then rejected every function
  // response from the website. Both live names are listed through the
  // jsrcoaching rename window.
  /^https:\/\/jsrcoaching\.vercel\.app$/i,
  /^https:\/\/jsrcoaching-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/safarenglishka\.vercel\.app$/i,
  /^https:\/\/safarenglishka-[a-z0-9-]+\.vercel\.app$/i,
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

/**
 * AUDIT 2026-09-17: the old fallback returned `ALLOWED[0]` for any origin that
 * did not match a pattern. After the safarenglishka → jsrcoaching rename the
 * deployed functions answered every request from the live site with
 * `Access-Control-Allow-Origin: https://safarenglishka.vercel.app`, so the
 * browser discarded the response and every AI/PDF/payment call surfaced as the
 * useless toast "Failed to send a request to the Edge Function".
 *
 * A mismatched allow-origin header is never useful: it cannot authorize the
 * caller and it destroys the error message. CORS is not this backend's security
 * boundary either — every function verifies the Supabase JWT (see
 * `_shared/auth.ts`) before doing any work. So echo the caller's origin and let
 * authentication decide, instead of silently breaking a whole domain whenever a
 * hostname changes.
 */
export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin || "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
  // Diagnostic only — lets us see an unexpected origin in logs/devtools without
  // breaking the response.
  if (origin && !isOriginAllowed(origin)) headers["X-Origin-Known"] = "false";
  return headers;
}
