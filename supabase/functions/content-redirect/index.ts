// Signs a private-bucket object and 302-redirects the caller.
// Purpose: any legacy `/object/public/content/<path>` URL stored in DB, shared
// via WhatsApp, deep-link, or opened directly in the browser, will resolve to
// a signed URL instead of a "Bucket not found" 404.
//
// Usage:
//   GET /functions/v1/content-redirect?path=thumbnails/amar-batch.jpg
//   GET /functions/v1/content-redirect?path=hero-banners/foo.png&ttl=3600
//
// verify_jwt is false (public read of already-public folders via RLS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Only these folders inside the `content` bucket are eligible for public
// signing. Everything else (course-videos, receipts, etc.) must go through
// authenticated flows.
const PUBLIC_FOLDERS = new Set([
  "thumbnails",
  "hero-banners",
  "chapter-icons",
  "book-covers",
  "avatars",
]);

const BUCKET = "content";
const DEFAULT_TTL = 3600; // 1h
const MAX_TTL = 24 * 3600; // 24h

function badRequest(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return badRequest("method_not_allowed", 405);
  }

  const url = new URL(req.url);
  let path = url.searchParams.get("path") ?? "";

  // Accept full legacy URLs and extract the object path.
  // e.g. https://<ref>.supabase.co/storage/v1/object/public/content/thumbnails/foo.jpg
  const legacyMatch = path.match(
    /\/storage\/v1\/object\/(?:public|sign)\/content\/(.+?)(?:\?|$)/,
  );
  if (legacyMatch) path = legacyMatch[1];

  path = path.replace(/^\/+/, "");
  if (!path || path.includes("..")) {
    return badRequest("invalid_path");
  }

  const folder = path.split("/")[0];
  if (!PUBLIC_FOLDERS.has(folder)) {
    return badRequest("folder_not_public", 403);
  }

  const ttl = Math.min(
    Math.max(parseInt(url.searchParams.get("ttl") ?? "", 10) || DEFAULT_TTL, 60),
    MAX_TTL,
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return badRequest("server_misconfigured", 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Rate limit: 60 req / 60s per client IP. Prevents signed-URL abuse / hotlink storms.
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  try {
    const { data: allowed, error: rlErr } = await admin.rpc(
      "check_rate_limit_text",
      { _bucket: "content_redirect", _identifier: ip, _max: 60, _window_seconds: 60 },
    );
    if (rlErr) {
      console.warn("[content-redirect] rate-limit rpc failed", rlErr);
    } else if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      });
    }
  } catch (e) {
    console.warn("[content-redirect] rate-limit threw", e);
  }

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, ttl);

  if (error || !data?.signedUrl) {
    console.error("[content-redirect] sign failed", { path, error });
    return badRequest("not_found", 404);
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: data.signedUrl,
      "Cache-Control": `public, max-age=${Math.floor(ttl / 2)}`,
    },
  });
});
