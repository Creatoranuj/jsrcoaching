import { createClient } from "npm:@supabase/supabase-js@2";
import { requireRole } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isRateLimited, rateLimitedResponse } from "../_shared/rateLimit.ts";
import { errorResponse, internalError } from "../_shared/errors.ts";

type Payload = { type?: string; record?: Record<string, unknown> };

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const gate = await requireRole(req, corsHeaders, ['admin', 'teacher']);
  if (!gate.ok) return gate.response;

  if (await isRateLimited({ bucket: "notify-ai", userId: gate.userId, max: 30, windowSeconds: 60 })) {
    return rateLimitedResponse(corsHeaders);
  }

  try {
    let payload: Payload;
    try {
      payload = await req.json() as Payload;
    } catch {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "Request body must be JSON" });
    }

    const { type, record } = payload;
    if (!type || !record || typeof record !== "object") {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: "type and record are required" });
    }

    const rec = record as Record<string, string | number | undefined>;

    let title = '';
    let content = '';
    const category = 'courses';
    let keywords: string[] = [];

    if (type === 'course') {
      title = `Course: ${rec.title}`;
      content = `New course added: "${rec.title}". ${rec.description || ''} Grade: ${rec.grade || 'N/A'}. Price: ₹${rec.price || 0}.`;
      keywords = ['course', String(rec.grade ?? ''), String(rec.title ?? '').toLowerCase()].filter(Boolean);
    } else if (type === 'lesson') {
      title = `Lecture: ${rec.title}`;
      content = `New lecture added: "${rec.title}". ${rec.description || ''} Category: ${rec.category || 'general'}.`;
      keywords = ['lecture', 'lesson', String(rec.category ?? ''), String(rec.title ?? '').toLowerCase()].filter(Boolean);
    } else if (type === 'material') {
      title = `Study Material: ${rec.title}`;
      content = `New study material uploaded: "${rec.title}". Type: ${rec.file_type}. ${rec.description || ''}`;
      keywords = ['material', 'pdf', 'notes', String(rec.file_type ?? ''), String(rec.title ?? '').toLowerCase()].filter(Boolean);
    } else {
      return errorResponse("INVALID_INPUT", corsHeaders, { message: `Unknown type: ${type}` });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('title', title)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, message: 'Already exists', id: existing[0].id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({ title, content, category, keywords, is_active: true, position: 999 })
      .select('id')
      .single();

    if (error) {
      console.error('[notify-ai] insert error:', JSON.stringify(error));
      return errorResponse("INTERNAL_ERROR", corsHeaders);
    }

    console.log(`notify-ai: Added ${type} "${rec.title}" (id: ${data.id})`);
    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return internalError(error, corsHeaders, "notify-ai");
  }
});
