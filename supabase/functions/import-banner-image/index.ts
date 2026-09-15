import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = /^image\/(png|jpe?g|webp|gif|avif)$/i;

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("avif")) return "avif";
  return "jpg";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: authData, error: authError } = await anonClient.auth.getUser();
  if (authError || !authData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = authData.user.id;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Admin gate
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  // Parse & validate input
  const body = await req.json().catch(() => ({}));
  const rawUrl = String(body?.url ?? "").trim();
  if (!/^https:\/\//i.test(rawUrl)) {
    return json({ error: "URL must start with https://" }, 400);
  }
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return json({ error: "Invalid URL" }, 400);
  }
  // SSRF guard: block private/loopback hostnames
  const host = target.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return json({ error: "URL host not allowed" }, 400);
  }

  // Fetch remote image
  let remote: Response;
  try {
    remote = await fetch(target.toString(), {
      redirect: "follow",
      headers: { "User-Agent": "Sadguru-BannerImporter/1.0" },
    });
  } catch (e) {
    return json({ error: `Fetch failed: ${(e as Error).message}` }, 502);
  }
  if (!remote.ok) {
    return json({ error: `Remote returned ${remote.status}` }, 502);
  }

  const contentType = (remote.headers.get("content-type") || "").split(";")[0].trim();
  if (!ALLOWED_MIME.test(contentType)) {
    return json({ error: `Unsupported content-type: ${contentType || "unknown"}` }, 400);
  }

  const contentLength = Number(remote.headers.get("content-length") || 0);
  if (contentLength && contentLength > MAX_BYTES) {
    return json({ error: `Image too large (${contentLength} bytes, max ${MAX_BYTES})` }, 400);
  }

  const buf = new Uint8Array(await remote.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return json({ error: `Image too large (${buf.byteLength} bytes, max ${MAX_BYTES})` }, 400);
  }

  const ext = extFromMime(contentType);
  const path = `hero-banners/imported/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("content")
    .upload(path, buf, { contentType, upsert: false });

  if (uploadError) {
    return json({ error: `Upload failed: ${uploadError.message}` }, 500);
  }

  return json({
    storage_uri: `storage://content/${path}`,
    size: buf.byteLength,
    content_type: contentType,
  });
});
