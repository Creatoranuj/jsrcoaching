import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireRole } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin/teacher only — this endpoint uploads to and lists our paid CDN bucket.
  const gate = await requireRole(req, corsHeaders, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;

  try {
    const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
    const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE");
    const BUNNY_CDN_HOSTNAME = Deno.env.get("BUNNY_CDN_HOSTNAME");
    const BUNNY_STORAGE_HOSTNAME = Deno.env.get("BUNNY_STORAGE_HOSTNAME") || "storage.bunnycdn.com";

    if (!BUNNY_API_KEY || !BUNNY_STORAGE_ZONE) {
      return new Response(
        JSON.stringify({ error: "Bunny.net credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, fileName, fileBase64, contentType, folder } = await req.json();

    // ── Path validation (prevent traversal / storage-zone escape) ──
    // Allow only `[A-Za-z0-9._/-]`, no `..` segments, no leading `/`, and cap length.
    const SAFE_PATH_RE = /^[A-Za-z0-9._/-]+$/;
    const isSafePath = (p: unknown): p is string => {
      if (typeof p !== "string" || p.length === 0 || p.length > 512) return false;
      if (p.startsWith("/") || p.includes("..") || p.includes("//")) return false;
      return SAFE_PATH_RE.test(p);
    };
    // Only these top-level prefixes are writable/listable from this endpoint.
    const ALLOWED_PREFIXES = ["course-videos/", "lesson-videos/", "lesson-attachments/", "course-assets/"];
    const hasAllowedPrefix = (p: string) => ALLOWED_PREFIXES.some((pre) => p.startsWith(pre));
    const badPathResponse = (msg: string) =>
      new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    // ── UPLOAD ──
    if (action === "upload") {
      if (!fileName || !fileBase64) {
        return new Response(
          JSON.stringify({ error: "Missing fileName or fileBase64" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isSafePath(fileName)) return badPathResponse("Invalid fileName");
      if (!hasAllowedPrefix(fileName)) {
        return badPathResponse(`fileName must start with one of: ${ALLOWED_PREFIXES.join(", ")}`);
      }

      const binaryData = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      const uploadUrl = `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${fileName}`;

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_API_KEY,
          "Content-Type": contentType || "application/octet-stream",
        },
        body: binaryData,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return new Response(
          JSON.stringify({ error: `Upload failed: ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cdnUrl = BUNNY_CDN_HOSTNAME
        ? `https://${BUNNY_CDN_HOSTNAME}/${fileName}`
        : `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/${fileName}`;

      return new Response(
        JSON.stringify({ success: true, cdnUrl, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── LIST ──
    if (action === "list") {
      // folder is optional; when provided it must be a safe path with an allowed prefix.
      let folderPath = "";
      if (folder !== undefined && folder !== null && folder !== "") {
        if (!isSafePath(folder)) return badPathResponse("Invalid folder");
        const normalized = folder.endsWith("/") ? folder : `${folder}/`;
        if (!hasAllowedPrefix(normalized)) {
          return badPathResponse(`folder must start with one of: ${ALLOWED_PREFIXES.join(", ")}`);
        }
        folderPath = normalized;
      } else {
        // No unrestricted root listing — force caller to specify an allowed prefix.
        return badPathResponse(`folder is required and must start with one of: ${ALLOWED_PREFIXES.join(", ")}`);
      }
      const listPath = `${BUNNY_STORAGE_ZONE}/${folderPath}`;
      const listUrl = `https://${BUNNY_STORAGE_HOSTNAME}/${listPath}`;

      const listRes = await fetch(listUrl, {
        headers: { AccessKey: BUNNY_API_KEY, Accept: "application/json" },
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        return new Response(
          JSON.stringify({ error: `List failed: ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const files = await listRes.json();
      const cdnBase = BUNNY_CDN_HOSTNAME || `${BUNNY_STORAGE_ZONE}.b-cdn.net`;
      const mapped = files.map((f: any) => ({
        name: f.ObjectName,
        cdnUrl: `https://${cdnBase}/${folderPath}${f.ObjectName}`,
        size: f.Length,
      }));

      return new Response(
        JSON.stringify({ files: mapped }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── STREAM URL ──
    if (action === "stream-url") {
      if (!fileName) {
        return new Response(
          JSON.stringify({ error: "Missing fileName" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isSafePath(fileName)) return badPathResponse("Invalid fileName");
      if (!hasAllowedPrefix(fileName)) {
        return badPathResponse(`fileName must start with one of: ${ALLOWED_PREFIXES.join(", ")}`);
      }

      const cdnBase = BUNNY_CDN_HOSTNAME || `${BUNNY_STORAGE_ZONE}.b-cdn.net`;
      const cdnUrl = `https://${cdnBase}/${fileName}`;

      return new Response(
        JSON.stringify({ cdnUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: upload, list, stream-url" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("bunny-cdn error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
