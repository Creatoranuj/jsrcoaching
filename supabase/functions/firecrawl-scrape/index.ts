import { requireRole } from "../_shared/auth.ts";
import { errorResponse, internalError } from "../_shared/errors.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { guardSwitch } from "../_shared/systemSwitch.ts";
// AUDIT 2026-09-25 [M2]: the old inline regex missed decimal/hex IPv4
// (2130706433, 0x7f000001), IPv4-mapped IPv6 and *.internal hosts. Use the
// shared validator (same one crawl4ai-bridge uses) as the single source of truth.
import { validatePublicUrl } from "../_shared/safeUrl.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Survival Mode: admin ne is function ko band kiya ho to yahin ruk jao.
  const __switchOff = await guardSwitch("firecrawl-scrape", corsHeaders);
  if (__switchOff) return __switchOff;

  const auth = await requireRole(req, corsHeaders, ["admin", "teacher"]);
  if (!auth.ok) return auth.response;

  try {
    let body: { url?: string; options?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "Request body must be JSON" });
    }
    const { url, options } = body;

    if (!url || typeof url !== "string") {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "url is required" });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[firecrawl-scrape] FIRECRAWL_API_KEY not configured');
      return errorResponse("CONFIG_MISSING", corsHeaders, { message: "Firecrawl connector not configured" });
    }

    const check = validatePublicUrl(url.trim());
    if (!check.ok || !check.url) {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: check.reason ?? "URL not allowed" });
    }
    const formattedUrl = check.url.toString();

    const opts = (options ?? {}) as Record<string, unknown>;
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: opts.formats ?? ['markdown'],
        onlyMainContent: opts.onlyMainContent ?? true,
        waitFor: opts.waitFor,
        location: opts.location,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[firecrawl-scrape] upstream error:', response.status, data);
      return errorResponse("UPSTREAM_ERROR", corsHeaders, { message: "Scrape failed" });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return internalError(error, corsHeaders, "firecrawl-scrape");
  }
});
