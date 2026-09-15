// Authenticated proxy for the external Telegram-backed PDF storage project.
// Prevents the external anon key from being exposed in the client bundle,
// gates access behind a valid JWT from THIS project, and re-verifies that
// the caller is entitled to the specific `view_id` requested by resolving
// it back to a lesson (via `lesson_pdfs` / `lesson_attachments`) and
// checking enrollment / admin / teacher / free-course status.
//
// Request: POST { view_id: string }  (Authorization: Bearer <user JWT>)
// Response: application/pdf bytes on 200; JSON error otherwise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildCorsHeaders } from "../_shared/cors.ts";

const TELEGRAM_SUPABASE_URL =
  Deno.env.get("TELEGRAM_STORAGE_URL") ??
  "https://hsvtagmckkfmniawflul.supabase.co";
// The upstream storage app ships this anon key in its own public JS bundle
// (https://storage-naveenbharat-recording.vercel.app/assets/index-*.js), so it
// is a publishable key, not a secret. Keeping it inline removes the single
// point of failure that broke every Telegram-backed lesson: a mis-set
// TELEGRAM_STORAGE_ANON_KEY secret holding an opaque `sb_…` key the upstream
// project rejects with 401. The env var still wins when set, so a future
// upstream rotation is a secret update, not a code change.
const TELEGRAM_STORAGE_DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzdnRhZ21ja2tmbW5pYXdmbHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzQ1NzUsImV4cCI6MjA4OTE1MDU3NX0.bumoGstxK-c1xeh4U91AS1xzF2XY6w8r9j2MS13Wy6g";
// Only a legacy JWT key (`eyJ…`) works against the upstream project's REST +
// Storage endpoints. A leftover opaque `sb_…` value in the function env used
// to win here and made every Telegram PDF fail with `storage_key_rejected`
// even after the Lovable secret was removed. Ignore any non-JWT override.
const TELEGRAM_STORAGE_ENV_KEY = Deno.env.get("TELEGRAM_STORAGE_ANON_KEY")?.trim() ?? "";
const TELEGRAM_SUPABASE_KEY = TELEGRAM_STORAGE_ENV_KEY.startsWith("eyJ")
  ? TELEGRAM_STORAGE_ENV_KEY
  : TELEGRAM_STORAGE_DEFAULT_ANON_KEY;

const VIEW_ID_RE = /^[a-f0-9-]{20,64}$/i;

function jsonErr(status: number, message: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const CORS_HEADERS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonErr(405, "Method not allowed", CORS_HEADERS);

  // Verify caller JWT against THIS project.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonErr(401, "Unauthorized", CORS_HEADERS);

  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authedClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authedClient.auth.getUser();
  if (!user) return jsonErr(401, "Unauthorized", CORS_HEADERS);

  let body: { view_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonErr(400, "Invalid JSON body", CORS_HEADERS);
  }
  const viewId = body.view_id?.trim();
  if (!viewId || !VIEW_ID_RE.test(viewId)) return jsonErr(400, "view_id required", CORS_HEADERS);

  // Enrollment / entitlement gate.
  // Look up the lesson that owns this view_id via a service-role client
  // (bypasses RLS on lesson_pdfs / lesson_attachments so we can find the
  // row regardless of whether the caller can normally read it), then
  // re-check that the caller is admin, the lesson's teacher, enrolled in
  // the owning course, or the lesson / course is free.
  const adminClient = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const viewPattern = `%/view/${viewId}%`;

  const [pdfsRes, attsRes, lessonRes] = await Promise.all([
    adminClient
      .from("lesson_pdfs")
      .select("lesson_id")
      .ilike("file_url", viewPattern)
      .limit(1),
    adminClient
      .from("lesson_attachments")
      .select("lesson_id")
      .ilike("file_url", viewPattern)
      .limit(1),
    // Storage links pasted straight into the lesson (admin upload writes the
    // URL to lessons.video_url / class_pdf_url, not to lesson_pdfs). Without
    // this branch every such lesson 404s as "Asset not registered".
    adminClient
      .from("lessons")
      .select("id")
      .or(`video_url.ilike.${viewPattern},class_pdf_url.ilike.${viewPattern}`)
      .limit(1),
  ]);
  const lessonId: string | undefined =
    pdfsRes.data?.[0]?.lesson_id ?? attsRes.data?.[0]?.lesson_id ?? lessonRes.data?.[0]?.id;

  if (!lessonId) {
    // Unknown asset — never served by us; reject rather than proxy anonymously.
    return jsonErr(404, "Asset not registered", CORS_HEADERS);
  }


  const { data: lesson } = await adminClient
    .from("lessons")
    .select("course_id,is_free")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return jsonErr(404, "Lesson not found", CORS_HEADERS);

  let entitled = lesson.is_free === true;

  if (!entitled && lesson.course_id != null) {
    const { data: course } = await adminClient
      .from("courses")
      .select("price")
      .eq("id", lesson.course_id)
      .maybeSingle();
    if (course && (course.price == null || Number(course.price) === 0)) {
      entitled = true;
    }
  }

  if (!entitled) {
    const [{ data: isAdmin }, { data: isTeacher }] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      adminClient.rpc("has_role", { _user_id: user.id, _role: "teacher" }),
    ]);
    if (isAdmin === true || isTeacher === true) entitled = true;
  }

  if (!entitled && lesson.course_id != null) {
    const { data: enroll } = await adminClient
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", lesson.course_id)
      .eq("status", "active")
      .limit(1);
    if ((enroll?.length ?? 0) > 0) entitled = true;
  }

  if (!entitled) return jsonErr(403, "Not entitled to this document", CORS_HEADERS);

  // Legacy JWT keys ("eyJ…") are sent as both apikey and Bearer. The newer
  // opaque keys (sb_publishable_… / sb_secret_…) must go in `apikey` only —
  // sending them as a Bearer token makes GoTrue reject the request with 401.
  const isLegacyJwtKey = TELEGRAM_SUPABASE_KEY.startsWith("eyJ");
  const upstreamHeaders: Record<string, string> = isLegacyJwtKey
    ? { apikey: TELEGRAM_SUPABASE_KEY, Authorization: `Bearer ${TELEGRAM_SUPABASE_KEY}` }
    : { apikey: TELEGRAM_SUPABASE_KEY };


  // 1. Resolve view_id → file_id via upstream REST.
  const rowUrl = `${TELEGRAM_SUPABASE_URL}/rest/v1/pdf_documents?select=file_id,file_name&id=eq.${encodeURIComponent(viewId)}`;
  const rowResp = await fetch(rowUrl, { headers: upstreamHeaders });
  if (!rowResp.ok) {
    // Log the upstream reason (never the key itself) so a bad/expired
    // TELEGRAM_STORAGE_ANON_KEY is diagnosable from the function logs.
    const upstreamBody = await rowResp.text().catch(() => "");
    console.error(
      `upstream_metadata_failed status=${rowResp.status} keyShape=${
        isLegacyJwtKey ? "jwt" : "opaque"
      } body=${upstreamBody.slice(0, 300)}`,
    );
    if (rowResp.status === 401 || rowResp.status === 403) {
      return new Response(
        JSON.stringify({
          code: "storage_key_rejected",
          error: "यह document अभी available नहीं है — admin को बताएँ।",
        }),
        { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    return jsonErr(502, `Upstream metadata HTTP ${rowResp.status}`, CORS_HEADERS);
  }

  const rows = (await rowResp.json()) as Array<{ file_id?: string; file_name?: string }>;
  const fileId = rows[0]?.file_id;
  const fileName = rows[0]?.file_name ?? "document.pdf";
  if (!fileId) return jsonErr(404, "Storage file not found", CORS_HEADERS);

  // 2. Fetch bytes via upstream edge function.
  const fileResp = await fetch(`${TELEGRAM_SUPABASE_URL}/functions/v1/telegram-get-file`, {
    method: "POST",
    headers: { ...upstreamHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!fileResp.ok) return jsonErr(502, `Upstream file HTTP ${fileResp.status}`, CORS_HEADERS);

  // Validate the real bytes before declaring PDF. The upstream can return a
  // JSON/HTML error with HTTP 200; passing that to pdf.js produces the opaque
  // "Invalid PDF structure" failure.
  if (!fileResp.body) return jsonErr(502, "Storage returned an empty file", CORS_HEADERS);
  const reader = fileResp.body.getReader();
  const chunks: Uint8Array[] = [];
  let prefixLength = 0;
  while (prefixLength < 5) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); prefixLength += value.byteLength; }
  }
  const prefix = new Uint8Array(prefixLength);
  let prefixOffset = 0;
  for (const chunk of chunks) { prefix.set(chunk, prefixOffset); prefixOffset += chunk.byteLength; }
  const signature = new TextDecoder().decode(prefix.subarray(0, 5));
  if (!signature.startsWith("%PDF-")) {
    await reader.cancel().catch(() => {});
    return new Response(JSON.stringify({ code: "not_pdf", error: "Storage returned invalid PDF bytes" }), {
      status: 415,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  // Upstream answers `application/octet-stream`; pdf.js and the native file
  // viewer both key off the MIME type, so always declare PDF here.
  const upstreamType = fileResp.headers.get("content-type") ?? "";
  const contentType = /pdf/i.test(upstreamType) ? upstreamType : "application/pdf";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(prefix); },
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) controller.close();
        else if (value) controller.enqueue(value);
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${fileName.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});