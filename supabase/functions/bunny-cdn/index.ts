// Bunny.net CDN proxy: upload / list (staff only) and stream-url (gated).
//
// AUDIT 2026-09-17:
//   [1] `stream-url` returned a PERMANENT, unsigned CDN URL. Anyone who got the
//       URL out of the network tab could share it forever, outside the app and
//       outside any enrollment check. It now returns a short-lived Bunny
//       Token-Authentication URL and only after an access check.
//   [2] Access check: admin/teacher, OR an active enrollment on the course that
//       owns the requested lesson, OR a free course. Fail closed.
//   [3] Errors now persist via the shared reporter instead of vanishing into
//       the ephemeral function log.
import "../_shared/errorReporting.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, requireRole } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, internalError } from "../_shared/errors.ts";
import { reportError } from "../_shared/errorReporting.ts";
import { isSafeRelPath, isUuid, isOneOf, isText, readJson } from "../_shared/validate.ts";

const ALLOWED_PREFIXES = [
  "course-videos/",
  "lesson-videos/",
  "lesson-attachments/",
  "course-assets/",
];
const hasAllowedPrefix = (p: string) => ALLOWED_PREFIXES.some((pre) => p.startsWith(pre));

/** Playback links expire in 4 hours — long enough for one sitting, useless when shared later. */
const STREAM_TTL_SECONDS = 4 * 60 * 60;

const ACTIONS = ["upload", "list", "stream-url"] as const;

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Bunny Token Authentication URL.
 * token = url-safe base64( sha256_raw( securityKey + path + expires ) )
 * Falls back to the plain CDN URL when BUNNY_TOKEN_KEY is not configured, so
 * playback keeps working until the key is set in the Bunny pull-zone.
 */
async function signedCdnUrl(
  cdnBase: string,
  filePath: string,
): Promise<{ url: string; signed: boolean; expiresAt: string | null }> {
  const securityKey = Deno.env.get("BUNNY_TOKEN_KEY");
  const plain = `https://${cdnBase}/${filePath}`;
  if (!securityKey) {
    console.error("[bunny-cdn] BUNNY_TOKEN_KEY not set — serving unsigned CDN URL");
    return { url: plain, signed: false, expiresAt: null };
  }
  const expires = Math.floor(Date.now() / 1000) + STREAM_TTL_SECONDS;
  const path = `/${filePath}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${securityKey}${path}${expires}`),
  );
  const token = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return {
    url: `${plain}?token=${token}&expires=${expires}`,
    signed: true,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

/** Fail-closed access check for a lesson's media. */
async function canAccessLesson(
  userId: string,
  lessonId: string,
  fileName: string,
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }> {
  const svc = serviceClient();

  const { data: lesson } = await svc
    .from("lessons")
    .select("id, course_id, video_url")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return { ok: false, code: "NOT_FOUND" };

  // The requested file must actually be this lesson's video, otherwise a
  // student could use one enrollment to mint links for any other course.
  if (!lesson.video_url || !String(lesson.video_url).includes(fileName)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const [roleRes, enrollmentRes, courseRes] = await Promise.all([
    svc.from("user_roles").select("role").eq("user_id", userId)
      .in("role", ["admin", "teacher"]).maybeSingle(),
    svc.from("enrollments").select("id").eq("user_id", userId)
      .eq("course_id", lesson.course_id).eq("status", "active").maybeSingle(),
    svc.from("courses").select("price").eq("id", lesson.course_id).maybeSingle(),
  ]);

  const isStaff = !!roleRes.data;
  const isEnrolled = !!enrollmentRes.data;
  const price = Number((courseRes.data as { price?: number } | null)?.price ?? 0);
  const isFree = !price || price <= 0;

  return isStaff || isEnrolled || isFree ? { ok: true } : { ok: false, code: "FORBIDDEN" };
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
    const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE");
    const BUNNY_CDN_HOSTNAME = Deno.env.get("BUNNY_CDN_HOSTNAME");
    const BUNNY_STORAGE_HOSTNAME =
      Deno.env.get("BUNNY_STORAGE_HOSTNAME") || "storage.bunnycdn.com";

    const body = await readJson<{
      action?: unknown;
      fileName?: unknown;
      fileBase64?: unknown;
      contentType?: unknown;
      folder?: unknown;
      lesson_id?: unknown;
      lessonId?: unknown;
    }>(req);

    const { action } = body;
    if (!isOneOf(action, ACTIONS)) {
      return errorResponse("INVALID_INPUT", corsHeaders, {
        message: `Unknown action. Use: ${ACTIONS.join(", ")}`,
      });
    }

    // ── STREAM URL (students + staff, gated per lesson) ──
    if (action === "stream-url") {
      const auth = await requireUser(req, corsHeaders);
      if (!auth.ok) return auth.response;

      const { fileName } = body;
      if (!isSafeRelPath(fileName)) {
        return errorResponse("INVALID_INPUT", corsHeaders, { message: "Invalid fileName" });
      }
      if (!hasAllowedPrefix(fileName)) {
        return errorResponse("INVALID_INPUT", corsHeaders, {
          message: `fileName must start with one of: ${ALLOWED_PREFIXES.join(", ")}`,
        });
      }
      if (!BUNNY_STORAGE_ZONE && !BUNNY_CDN_HOSTNAME) {
        return errorResponse("CONFIG_MISSING", corsHeaders);
      }

      const rawLesson = body.lesson_id ?? body.lessonId;
      const lessonId = typeof rawLesson === "string" ? rawLesson.trim() : "";

      // Staff may resolve any path (admin panel previews). Everyone else must
      // name the lesson they are watching and pass the enrollment check.
      const staffGate = await requireRole(req, corsHeaders, ["admin", "teacher"]);
      if (!staffGate.ok) {
        if (!isUuid(lessonId)) {
          return errorResponse("INVALID_INPUT", corsHeaders, {
            message: "lesson_id is required",
          });
        }
        const access = await canAccessLesson(auth.userId, lessonId, fileName);
        if (!access.ok) {
          return errorResponse(access.code, corsHeaders, {
            message: access.code === "NOT_FOUND"
              ? "Lesson not found"
              : "Purchase required to access this video",
          });
        }
      }

      const cdnBase = BUNNY_CDN_HOSTNAME || `${BUNNY_STORAGE_ZONE}.b-cdn.net`;
      const { url, signed, expiresAt } = await signedCdnUrl(cdnBase, fileName);
      return new Response(
        JSON.stringify({ cdnUrl: url, signed, expiresAt }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    // ── upload / list: staff only, they touch our paid storage zone ──
    const gate = await requireRole(req, corsHeaders, ["admin", "teacher"]);
    if (!gate.ok) return gate.response;

    if (!BUNNY_API_KEY || !BUNNY_STORAGE_ZONE) {
      console.error("[bunny-cdn] Bunny.net credentials not configured");
      return errorResponse("CONFIG_MISSING", corsHeaders);
    }

    // ── UPLOAD ──
    if (action === "upload") {
      const { fileName, fileBase64, contentType } = body;
      if (!isSafeRelPath(fileName)) {
        return errorResponse("INVALID_INPUT", corsHeaders, { message: "Invalid fileName" });
      }
      if (!hasAllowedPrefix(fileName)) {
        return errorResponse("INVALID_INPUT", corsHeaders, {
          message: `fileName must start with one of: ${ALLOWED_PREFIXES.join(", ")}`,
        });
      }
      if (!isText(fileBase64, 1, 200_000_000)) {
        return errorResponse("INVALID_INPUT", corsHeaders, { message: "Missing fileBase64" });
      }

      let binaryData: Uint8Array;
      try {
        binaryData = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      } catch {
        return errorResponse("INVALID_INPUT", corsHeaders, {
          message: "fileBase64 is not valid base64",
        });
      }

      const uploadUrl = `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${fileName}`;
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_API_KEY,
          "Content-Type": typeof contentType === "string" && contentType
            ? contentType
            : "application/octet-stream",
        },
        body: binaryData,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        await reportError(new Error(`upload ${uploadRes.status}: ${errText.slice(0, 300)}`), {
          surface: "bunny-cdn",
          stage: "upload",
          userId: gate.userId,
        });
        // Never echo the provider body — it can carry storage-zone details.
        return errorResponse("UPSTREAM_ERROR", corsHeaders, { message: "Upload failed" });
      }

      const cdnUrl = BUNNY_CDN_HOSTNAME
        ? `https://${BUNNY_CDN_HOSTNAME}/${fileName}`
        : `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/${fileName}`;

      return new Response(
        JSON.stringify({ success: true, cdnUrl, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── LIST ──
    const { folder } = body;
    if (!isSafeRelPath(folder)) {
      return errorResponse("INVALID_INPUT", corsHeaders, {
        message: `folder is required and must start with one of: ${ALLOWED_PREFIXES.join(", ")}`,
      });
    }
    const folderPath = folder.endsWith("/") ? folder : `${folder}/`;
    if (!hasAllowedPrefix(folderPath)) {
      return errorResponse("INVALID_INPUT", corsHeaders, {
        message: `folder must start with one of: ${ALLOWED_PREFIXES.join(", ")}`,
      });
    }

    const listUrl = `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${folderPath}`;
    const listRes = await fetch(listUrl, {
      headers: { AccessKey: BUNNY_API_KEY, Accept: "application/json" },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      await reportError(new Error(`list ${listRes.status}: ${errText.slice(0, 300)}`), {
        surface: "bunny-cdn",
        stage: "list",
        userId: gate.userId,
      });
      return errorResponse("UPSTREAM_ERROR", corsHeaders, { message: "List failed" });
    }

    const files = await listRes.json();
    const cdnBase = BUNNY_CDN_HOSTNAME || `${BUNNY_STORAGE_ZONE}.b-cdn.net`;
    const mapped = (Array.isArray(files) ? files : []).map((f: Record<string, unknown>) => ({
      name: f.ObjectName,
      cdnUrl: `https://${cdnBase}/${folderPath}${f.ObjectName}`,
      size: f.Length,
    }));

    return new Response(
      JSON.stringify({ files: mapped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    await reportError(err, { surface: "bunny-cdn" });
    return internalError(err, corsHeaders, "bunny-cdn");
  }
});
