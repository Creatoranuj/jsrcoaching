import { createClient } from "npm:@supabase/supabase-js@2";
import { errorResponse, internalError } from "../_shared/errors.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function splitIntoChunks(content: string, title: string, maxLen = 1500): Array<{ title: string; content: string }> {
  if (content.length <= maxLen) return [{ title, content }];
  const chunks: Array<{ title: string; content: string }> = [];
  const paragraphs = content.split(/\n\n+/);
  let current = '';
  let idx = 1;
  for (const para of paragraphs) {
    if ((current + para).length > maxLen && current.length > 0) {
      chunks.push({ title: `${title} (Part ${idx})`, content: current.trim() });
      current = para;
      idx++;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) chunks.push({ title: idx > 1 ? `${title} (Part ${idx})` : title, content: current.trim() });
  return chunks;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse("UNAUTHORIZED", corsHeaders);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!)
      .auth.getUser(token);
    if (authError || !user) return errorResponse("UNAUTHORIZED", corsHeaders);

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (roleData?.role !== 'admin') return errorResponse("FORBIDDEN", corsHeaders, { message: "Admin access required" });

    let body: { url?: string; mode?: string; category?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "Request body must be JSON" });
    }
    const { url, mode = 'scrape', category = 'general' } = body;

    if (!url || typeof url !== "string") {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "url is required" });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "Invalid URL format" });
    }

    const SSRF_BLOCKLIST = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:)/i;
    if (!['https:', 'http:'].includes(targetUrl.protocol) || SSRF_BLOCKLIST.test(targetUrl.hostname)) {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "URL not allowed" });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return errorResponse("CONFIG_MISSING", corsHeaders, { message: "Firecrawl API key not configured" });
    }

    // ==========================================
    // SCRAPE MODE: return markdown directly
    // ==========================================
    if (mode === 'scrape') {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: targetUrl.href,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Firecrawl error: ${response.status} ${data.error || JSON.stringify(data)}`);
      }

      const markdown = data.data?.markdown || data.markdown || '';
      const pageTitle = data.data?.metadata?.title || data.metadata?.title || targetUrl.hostname;

      return new Response(JSON.stringify({
        success: true,
        markdown: markdown.slice(0, 8000),
        title: pageTitle,
        url: targetUrl.href,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ==========================================
    // INGEST MODE: scrape + save to knowledge_base
    // ==========================================
    if (mode === 'ingest') {
      const { data: historyRecord } = await supabase
        .from('crawl_history')
        .insert({ url: targetUrl.href, status: 'pending', crawled_by: user.id })
        .select()
        .single();

      const historyId = historyRecord?.id;

      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: targetUrl.href,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Firecrawl error: ${response.status} ${data.error || JSON.stringify(data)}`);
        }

        const markdown = data.data?.markdown || data.markdown || '';
        const pageTitle = data.data?.metadata?.title || data.metadata?.title || targetUrl.hostname;

        if (!markdown || markdown.length < 50) {
          throw new Error('Page returned empty or very short content. Try a different URL.');
        }

        const chunks = splitIntoChunks(markdown, pageTitle);
        const kbEntries = chunks.map(chunk => ({
          title: chunk.title,
          content: chunk.content,
          category,
          keywords: [
            targetUrl.hostname.replace('www.', ''),
            ...pageTitle.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3).slice(0, 5),
          ],
          is_active: true,
          position: 999,
        }));

        const { data: insertedEntries, error: kbError } = await supabase
          .from('knowledge_base')
          .insert(kbEntries)
          .select('id');

        if (kbError) throw new Error(`DB insert error: ${kbError.message}`);

        const entriesCreated = insertedEntries?.length || 0;

        if (historyId) {
          await supabase.from('crawl_history').update({
            status: 'completed',
            knowledge_entries_created: entriesCreated,
            title: pageTitle,
            content_preview: markdown.slice(0, 200),
          }).eq('id', historyId);
        }

        return new Response(JSON.stringify({
          success: true,
          title: pageTitle,
          entriesCreated,
          url: targetUrl.href,
          historyId,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (innerErr) {
        const errMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (historyId) {
          await supabase.from('crawl_history').update({
            status: 'failed',
            error_message: errMsg,
          }).eq('id', historyId);
        }
        throw innerErr;
      }
    }

    return errorResponse("INVALID_INPUT", corsHeaders, { message: 'Invalid mode. Use "scrape" or "ingest"' });

  } catch (error) {
    return internalError(error, corsHeaders, "crawl4ai-bridge");
  }
});
