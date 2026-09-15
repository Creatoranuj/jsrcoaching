import { requireRole } from "../_shared/auth.ts";
import { errorResponse, internalError } from "../_shared/errors.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SSRF_BLOCKLIST = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:)/i;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    try {
      const parsed = new URL(formattedUrl);
      if (!['https:', 'http:'].includes(parsed.protocol) || SSRF_BLOCKLIST.test(parsed.hostname)) {
        return errorResponse("INVALID_INPUT", corsHeaders, { message: "URL not allowed" });
      }
    } catch {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "Invalid URL" });
    }

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
