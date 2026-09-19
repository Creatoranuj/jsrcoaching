import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { missingEnvResponse, requireEnvAll } from "../_shared/requireEnv.ts";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = /^image\/(png|jpe?g|webp|gif|avif)$/i;
const MAX_REDIRECTS = 5;

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("avif")) return "avif";
  return "jpg";
}

/** Blocks loopback, link-local, and RFC1918 targets (IPv4 and IPv6 forms). */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "::1" || host === "::" || host === "0.0.0.0") return false;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return false;
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ipv4 = mapped ? mapped[1] : host;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) {
    const [a, b] = ipv4.split(".").map(Number);
    if (a === 0 || a === 127 || a === 10) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a >= 224) return false;
  }
  return true;
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

  // Name the exact missing secret instead of failing later with a confusing
  // "Invalid API key" from Supabase.
  let env: Record<string, string>;
  try {
    env = requireEnvAll("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  } catch (e) {
    return missingEnvResponse(e, corsHeaders) ?? json({ error: "Server configuration incomplete" }, 500);
  }

  const anonClient = createClient(
    env["SUPABASE_URL"],
    env["SUPABASE_ANON_KEY"],
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: authData, error: authError } = await anonClient.auth.getUser();
  if (authError || !authData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = authData.user.id;

  const admin = createClient(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]);

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
  if (!isPublicHost(target.hostname)) {
    return json({ error: "URL host not allowed" }, 400);
  }

  // Follow redirects by hand so every hop is re-validated. `redirect: "follow"`
  // would let a public URL bounce to 127.0.0.1 or 169.254.169.254.
  let remote: Response;
  try {
    let current = target;
    let response = await fetch(current.toString(), {
      redirect: "manual",
      headers: { "User-Agent": "JSRCoaching-BannerImporter/1.0" },
    });
    for (let hop = 0; [301, 302, 303, 307, 308].includes(response.status); hop++) {
      const location = response.headers.get("location");
      if (!location) break;
      if (hop >= MAX_REDIRECTS) {
        return json({ error: "Too many redirects" }, 502);
      }
      const next = new URL(location, current);
      if (next.protocol !== "https:" || !isPublicHost(next.hostname)) {
        return json({ error: "URL host not allowed" }, 400);
      }
      current = next;
      response = await fetch(current.toString(), {
        redirect: "manual",
        headers: { "User-Agent": "JSRCoaching-BannerImporter/1.0" },
      });
    }
    remote = response;
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
