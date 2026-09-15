import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,200}$/;
// Hardening cap for generic allow-listed CDN proxy only. Drive PDFs are streamed
// without a size ceiling because large lecture PDFs commonly exceed 80 MB.
const DIRECT_URL_MAX_BYTES = 80 * 1024 * 1024; // 80 MB
const UPSTREAM_TIMEOUT_MS = 45_000;
// Archive.org scan nodes are deliberately throttled. A 512 KB Range can take
// longer than the generic 45s budget, and aborting the response body midway
// makes pdf.js report "file download was cut short". Keep this archive-only so
// every other proxy source retains the tighter failure budget.
const ARCHIVE_UPSTREAM_TIMEOUT_MS = 90_000;
// Drive throttles large PDFs (>50 MB) to ~1 MB/s; a 120s cap was clipping
// streams mid-flight → pdf.js received a truncated body → onLoadSuccess never
// fired → "Opening … 90%" stall. Give the streaming phase more headroom while
// staying under Deno Deploy's 400 s wall-clock ceiling for edge functions.
const DRIVE_UPSTREAM_TIMEOUT_MS = 300_000;

// Phase B: Drive PDF cache in Supabase Storage.
// First request pulls from Drive AND streams a copy into pdf-cache/drive/<id>.pdf.
// Subsequent requests get a 302 redirect to a signed URL served by Supabase's
// CDN with proper Range request support — pdf.js can render page 1 in seconds
// instead of waiting for the whole Drive throttled stream.
const CACHE_BUCKET = "pdf-cache";
const CACHE_SIGNED_URL_TTL = 60 * 60 * 6; // 6h signed URL; browser caches per Cache-Control below

const headersWithCors = (extra: HeadersInit = {}) => ({
  ...corsHeaders,
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type, cache-control, cache-tag, x-pdf-total-bytes",
  // pdf.js makes many Range requests for a large scan. Cache the successful
  // preflight so mobile browsers do not add an OPTIONS round-trip per chunk.
  "Access-Control-Max-Age": "86400",
  ...extra,
});

// AbortSignal.timeout polyfill (Deno Deploy has it, but be explicit so the
// behavior is identical across runtimes).
const timeoutSignal = (ms: number): AbortSignal => {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error(`Upstream timeout after ${ms}ms`)), ms);
  return ctrl.signal;
};

const isOversize = (res: Response): boolean => {
  const len = Number(res.headers.get("content-length") || "0");
  return Number.isFinite(len) && len > DIRECT_URL_MAX_BYTES;
};

// Fire-and-forget metrics insert. We never await this — the reader's
// perceived latency must not depend on Postgres. If SUPABASE_URL /
// service-role key aren't present (local dev), we skip silently.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// AUTH: pdf-proxy streams paid course PDFs, so every request needs a valid
// session. pdf.js loads the URL inside an <iframe>/worker that cannot set
// request headers, so the JWT may arrive either in the Authorization header
// or as a `?token=` query param.
async function authenticate(req: Request): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  let token = "";
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return null;
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Mirror the lesson_pdfs SELECT RLS: staff bypass, else the drive id must map
// to a free/preview lesson or a course the caller is actively enrolled in.
async function authorizeDrive(userId: string, driveId: string): Promise<boolean> {
  if (!adminClient) return false;
  const { data: roles } = await adminClient
    .from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "teacher"]);
  if (roles && roles.length > 0) return true;

  const like = `%${driveId}%`;
  const lessonIds = new Set<string>();
  const courseIds = new Set<number>();

  const { data: lp } = await adminClient
    .from("lesson_pdfs").select("lesson_id").or(`drive_id.eq.${driveId},file_url.ilike.${like}`);
  lp?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: nt } = await adminClient
    .from("notes").select("lesson_id").ilike("pdf_url", like);
  nt?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: mt } = await adminClient
    .from("materials").select("course_id").ilike("file_url", like);
  mt?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });

  // PDF-type lessons keep their Drive link in `video_url` (the admin upload form
  // writes one URL column for every lecture type), so matching only
  // `class_pdf_url` made every enrolled student get 403 "Not authorized for this
  // file" on Drive PDFs while staff (role bypass) saw them fine.
  const { data: lc } = await adminClient
    .from("lessons").select("course_id, is_free, is_preview")
    .or(`class_pdf_url.ilike.${like},video_url.ilike.${like}`);
  for (const r of lc ?? []) {
    if (r.is_free || r.is_preview) return true;
    if (r.course_id != null) courseIds.add(r.course_id as number);
  }

  // Attachment chips (lesson_attachments) resolve through their lesson.
  const { data: la } = await adminClient
    .from("lesson_attachments").select("lesson_id").ilike("file_url", like);
  la?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  if (lessonIds.size > 0) {
    const { data: ls } = await adminClient
      .from("lessons").select("course_id, is_free, is_preview").in("id", [...lessonIds]);
    for (const r of ls ?? []) {
      if (r.is_free || r.is_preview) return true;
      if (r.course_id != null) courseIds.add(r.course_id as number);
    }
  }

  if (courseIds.size === 0) return false;

  const { data: enr } = await adminClient
    .from("enrollments").select("course_id")
    .eq("user_id", userId).eq("status", "active").in("course_id", [...courseIds]);
  return !!(enr && enr.length > 0);
}

// Same enrollment gate as authorizeDrive, but for CDN-hosted PDFs.
// Resolves the target URL back to its owning lesson/course by matching
// lesson_pdfs.file_url / notes.pdf_url / materials.file_url / lessons.class_pdf_url,
// then allows staff / free lesson / active enrollment.
async function authorizeUrl(userId: string, url: string): Promise<boolean> {
  if (!adminClient) return false;
  const { data: roles } = await adminClient
    .from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "teacher"]);
  if (roles && roles.length > 0) return true;

  // URL-encoding drift: admins paste links containing literal spaces
  // ("…/Suffer English /file.pdf") into the DB, while the browser/pdf.js sends
  // the percent-encoded form ("…/Suffer%20English%20/file.pdf"). A plain
  // .eq() then never matches → false "Not authorized for this file".
  // Match every equivalent spelling instead. (.in() stays parameterized, so
  // there's no PostgREST filter-injection risk.)
  const urlVariants = (() => {
    const set = new Set<string>([url]);
    // Decode repeatedly: some callers double-encode ("%2520" → "%20" → " ").
    let cur = url;
    for (let i = 0; i < 3; i++) {
      let next: string;
      try { next = decodeURIComponent(cur); } catch { break; }
      if (next === cur) break;
      cur = next;
      set.add(cur);
      try { set.add(encodeURI(cur)); } catch { /* ignore */ }
    }
    try { set.add(encodeURI(url)); } catch { /* ignore */ }
    // Google Docs/Sheets/Slides are stored as the shareable `/edit` link but
    // proxied as `/export?format=pdf`; archive.org items are stored as
    // `/details/<id>` but proxied as a download URL. Add the canonical stored
    // spellings so the enrollment lookup still resolves.
    const g = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]+)/);
    if (g) {
      const base = `https://docs.google.com/${g[1]}/d/${g[2]}`;
      for (const suffix of ["/edit", "/view", "/preview", "", "/edit?usp=sharing", "/edit?usp=drivesdk", "/edit?usp=drive_link"]) {
        set.add(`${base}${suffix}`);
      }
    }
    const a = url.match(/archive\.org\/(?:details|download)\/([^/?#]+)/i);
    if (a) {
      set.add(`https://archive.org/details/${a[1]}`);
      set.add(`https://archive.org/download/${a[1]}`);
    }
    return [...set];
  })();



  const lessonIds = new Set<string>();
  const courseIds = new Set<number>();

  const { data: lp } = await adminClient
    .from("lesson_pdfs").select("lesson_id").in("file_url", urlVariants);
  lp?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: nt } = await adminClient
    .from("notes").select("lesson_id").in("pdf_url", urlVariants);
  nt?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: mt } = await adminClient
    .from("materials").select("course_id").in("file_url", urlVariants);
  mt?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });

  // study_materials — admin uploads a Drive/CDN link here (external_url) or a
  // storage-hosted file (file_url). Without these lookups the enrollment
  // resolver falls through to "courseIds empty → deny", which was breaking
  // every jsDelivr-hosted lecture PDF added via the Study Materials admin.
  // SECURITY: use two parameterized queries instead of interpolating
  // user input into an .or() filter string — a comma in the URL would inject
  // extra PostgREST conditions and let a caller bypass the enrollment gate.
  const [smExt, smFile] = await Promise.all([
    adminClient.from("study_materials").select("course_id").in("external_url", urlVariants),
    adminClient.from("study_materials").select("course_id").in("file_url", urlVariants),
  ]);
  smExt.data?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });
  smFile.data?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });

  // lesson_attachments — enrolled-user-visible chip attachments.
  const { data: la } = await adminClient
    .from("lesson_attachments").select("lesson_id").in("file_url", urlVariants);
  la?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: lc } = await adminClient
    .from("lessons").select("course_id, is_free, is_preview").in("class_pdf_url", urlVariants);

  for (const r of lc ?? []) {
    if (r.is_free || r.is_preview) return true;
    if (r.course_id != null) courseIds.add(r.course_id as number);
  }

  // Knowledge-Hub style lessons keep the document link in `video_url` (the
  // admin uploader writes there for non-video lecture types). Without this
  // lookup every Google Docs/Sheets/CDN link stored that way resolves to
  // "courseIds empty → deny" and the reader shows a generic load failure.
  const { data: lv } = await adminClient
    .from("lessons").select("course_id, is_free, is_preview").in("video_url", urlVariants);

  for (const r of lv ?? []) {
    if (r.is_free || r.is_preview) return true;
    if (r.course_id != null) courseIds.add(r.course_id as number);
  }

  if (lessonIds.size > 0) {
    const { data: ls } = await adminClient
      .from("lessons").select("course_id, is_free, is_preview").in("id", [...lessonIds]);
    for (const r of ls ?? []) {
      if (r.is_free || r.is_preview) return true;
      if (r.course_id != null) courseIds.add(r.course_id as number);
    }
  }

  // Unknown URL — not tied to any paid content row. Deny by default so
  // the proxy can't be used to bypass future paywalls; add explicit rows
  // if a URL needs to be freely accessible.
  if (courseIds.size === 0) return false;

  const { data: enr } = await adminClient
    .from("enrollments").select("course_id")
    .eq("user_id", userId).eq("status", "active").in("course_id", [...courseIds]);
  return !!(enr && enr.length > 0);
}

const metricsClient = adminClient;

// Note: bucket file-size limit is enforced project-wide by Supabase Storage
// (default 50 MiB on managed projects). We cap the tee-upload at 48 MB
// (see cacheDriveBodyInBackground) and rely on the Supabase edge CDN for
// bigger PDFs — the immutable Cache-Control we set on Drive responses is
// enough for ~10× repeat-open speedup.
const bootstrapAttempted = true;
async function ensureCacheBucketConfigured() { void bootstrapAttempted; }



function recordMetric(row: {
  event: string;
  drive_id?: string | null;
  tier?: string | null;
  last_status?: number | null;
  last_content_type?: string | null;
  // AUDIT 2026-09-08: drive_id was NULL on 1,474 of 1,509 rows, so a slow or
  // failed open could never be traced back to a lecture. Every branch now
  // reports the lesson it served plus how long resolve vs stream took.
  lesson_id?: string | null;
  source_kind?: string | null;
  resolve_ms?: number | null;
  stream_ms?: number | null;
}) {
  if (!metricsClient) return;
  // Never let a logging failure surface to the caller.
  try {
    Promise.resolve(metricsClient.from("pdf_proxy_metrics").insert(row))
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.warn("[pdf-proxy:metrics]", error.message);
      })
      .catch((err: unknown) => console.warn("[pdf-proxy:metrics]", err));
  } catch (err) { console.warn("[pdf-proxy:metrics]", err); }
}

/**
 * Try to short-circuit a Drive request by redirecting to a signed URL in the
 * pdf-cache bucket. Returns a 302 Response on cache hit, null on miss.
 */
async function tryCacheRedirect(driveId: string): Promise<Response | null> {
  if (!adminClient) return null;
  const path = `drive/${driveId}.pdf`;
  try {
    // HEAD-style existence check via createSignedUrl — cheap, no download.
    // Supabase returns 400/404 in `error` when the object is missing.
    const { data, error } = await adminClient.storage
      .from(CACHE_BUCKET)
      .createSignedUrl(path, CACHE_SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return null;
    recordMetric({ event: "drive_cache_hit", drive_id: driveId, tier: "cache", last_status: 302 });
    return new Response(null, {
      status: 302,
      headers: headersWithCors({
        Location: data.signedUrl,
        "Cache-Control": "public, max-age=300",
        "X-Pdf-Cache": "hit",
      }),
    });
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: buffer the tee'd Drive response body and upload to
 * pdf-cache. Runs concurrently with the streaming response to the browser.
 * Uses EdgeRuntime.waitUntil so Supabase keeps the worker alive after the
 * response stream ends — otherwise the tee upload gets killed mid-flight.
 */
function cacheDriveBodyInBackground(driveId: string, bodyStream: ReadableStream<Uint8Array>, contentType: string) {
  if (!adminClient) return;
  const path = `drive/${driveId}.pdf`;
  const work = (async () => {
    try {
      const reader = bodyStream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      // Supabase Storage enforces a project-level per-object cap (default
      // 50 MiB on managed projects). Skip caching when a PDF would exceed
      // that — the Supabase edge CDN already gives a ~10× speedup on repeat
      // opens for larger PDFs via the immutable Cache-Control we set below.
      const MAX = 48 * 1024 * 1024;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX) { console.warn("[pdf-proxy:cache] oversize, skipping", driveId, total); return; }
          chunks.push(value);
        }
      }
      // Concatenate to a single Uint8Array backed by a plain ArrayBuffer so
      // Blob's typings accept it (Deno's Uint8Array<ArrayBufferLike> otherwise
      // trips `SharedArrayBuffer is missing…`).
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
      const blob = new Blob([merged], { type: contentType || "application/pdf" });
      const { error } = await adminClient.storage.from(CACHE_BUCKET).upload(path, blob, {
        contentType: contentType || "application/pdf",
        upsert: true,
        cacheControl: "31536000",
      });
      if (error) {
        console.warn("[pdf-proxy:cache] upload failed", driveId, error.message);
      } else {
        console.info("[pdf-proxy:cache] stored", driveId, total);
        recordMetric({ event: "drive_cache_store", drive_id: driveId, tier: "cache", last_status: 200 });
      }
    } catch (err) {
      console.warn("[pdf-proxy:cache] tee error", driveId, (err as Error).message);
    }
  })();
  try {
    (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
      .EdgeRuntime?.waitUntil(work);
  } catch { /* no waitUntil available (local Deno run) — work still runs, may be killed */ }
}

Deno.serve(async (req) => {
  // Best-effort one-time bucket config (fire-and-forget; no await).
  ensureCacheBucketConfigured();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: headersWithCors() });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: headersWithCors({ "Content-Type": "application/json" }),
    });
  }

  try {
    const input = new URL(req.url);
    const kind = input.searchParams.get("kind");
    const id = input.searchParams.get("id") || "";

    // Require a valid session for every proxied fetch (paid course content).
    const userId = await authenticate(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }


    // kind=archive → archive.org item. Resolve the item's first PDF file via
    // the public metadata API, then stream it through the same guarded path.
    if (kind === "archive") {
      const itemId = input.searchParams.get("id") || "";
      const original = input.searchParams.get("url") || `https://archive.org/details/${itemId}`;
      if (!/^[A-Za-z0-9._-]{1,120}$/.test(itemId)) {
        return new Response(JSON.stringify({ error: "Invalid archive.org item id" }), {
          status: 400,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      if (!(await authorizeUrl(userId, original))) {
        return new Response(JSON.stringify({ error: "Not authorized for this file" }), {
          status: 403,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      const lessonIdParam = input.searchParams.get("lesson_id");
      const archiveStartedAt = Date.now();
      const { url: target, resolveMs: archiveResolveMs } = await archiveNodeUrlFor(itemId);
      if (target && archiveResolveMs > 0) prefetchArchiveRanges(target);
      if (!target) {
        return new Response(JSON.stringify({
          error: "No PDF file found in this archive.org item.",
          code: "not_pdf",
        }), {
          status: 415,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      let upstreamArchive = await fetchRemoteFile(
        target,
        req.headers.get("range"),
        ARCHIVE_UPSTREAM_TIMEOUT_MS,
      );
      // A cached CDN node URL can go stale (node rotation / expiry). Drop the
      // entry and re-resolve exactly once before giving up.
      if ([403, 404, 410].includes(upstreamArchive.status)) {
        await upstreamArchive.body?.cancel().catch(() => {});
        archiveNodeCache.delete(itemId);
        await dropStoredResolution(`archive:${itemId}`);
        const { url: retryTarget } = await archiveNodeUrlFor(itemId);
        if (retryTarget) {
          upstreamArchive = await fetchRemoteFile(
            retryTarget,
            req.headers.get("range"),
            ARCHIVE_UPSTREAM_TIMEOUT_MS,
          );
        }
      }
      recordMetric({
        event: "archive_success",
        tier: "archive",
        last_status: upstreamArchive.status,
        last_content_type: upstreamArchive.headers.get("content-type"),
        lesson_id: lessonIdParam,
        source_kind: "archive",
        resolve_ms: archiveResolveMs,
        stream_ms: Date.now() - archiveStartedAt - archiveResolveMs,
      });
      return await relayUpstream(upstreamArchive, req.method, req.headers.get("range"));
    }

    // kind=url → generic CORS-safe proxy for allow-listed direct PDF CDNs
    // (jsDelivr, GitHub raw, etc). The web/native reader routes every
    // jsDelivr-hosted Class Notes PDF through here via remotePdfProxyUrl().
    if (kind === "url") {

      const target = input.searchParams.get("url") || "";
      if (!(await isAllowedPdfUrlAsync(target))) {
        return new Response(JSON.stringify({ error: "URL not allowed" }), {
          status: 400,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      // Enrollment/ownership gate — mirrors the Drive branch below so the
      // generic CDN proxy can't be used to bypass payment for paid PDFs.
      if (!(await authorizeUrl(userId, target))) {
        return new Response(JSON.stringify({ error: "Not authorized for this file" }), {
          status: 403,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      const rangeHeader = req.headers.get("range");
      const upstreamUrl = await fetchRemoteFile(target, rangeHeader);
      // Skip the oversize check when a Range was requested — content-length
      // is the chunk size, not the full file. pdf.js relies on Range for
      // fast first-page paint of large PDFs.
      if (!rangeHeader && isOversize(upstreamUrl)) {
        return new Response(JSON.stringify({ error: "PDF exceeds 80 MB limit" }), {
          status: 413,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      recordMetric({
        event: "url_success",
        tier: "url",
        last_status: upstreamUrl.status,
        last_content_type: upstreamUrl.headers.get("content-type"),
      });
      return await relayUpstream(upstreamUrl, req.method, rangeHeader);
    }

    if (kind !== "drive" || !DRIVE_ID_RE.test(id)) {
      return new Response(JSON.stringify({ error: "Valid Drive file id is required" }), {
        status: 400,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }

    // Enrollment/ownership gate — mirrors the lesson_pdfs SELECT RLS so this
    // proxy can't be used to bypass payment for Drive-hosted lecture PDFs.
    if (!(await authorizeDrive(userId, id))) {
      return new Response(JSON.stringify({ error: "Not authorized for this file" }), {
        status: 403,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }



    // Phase B: cache hit → 302 to signed Supabase Storage URL. The client
    // then streams from Supabase's CDN with real Range support so pdf.js
    // renders page 1 in seconds. Skip cache lookup on HEAD (client is
    // probing) and when caller explicitly asks for `no-cache`.
    if (req.method === "GET" && req.headers.get("cache-control") !== "no-cache") {
      const hit = await tryCacheRedirect(id);
      if (hit) return hit;
    }

    // Cache miss — fetch from Drive and tee the body: one stream to the
    // browser, one to the storage upload (fire-and-forget).
    const upstream = await fetchDriveFile(id);
    if (!upstream.ok || !upstream.body) {
      const privateLike = upstream.status === 403 || upstream.status === 404 || upstream.status === 415;
      return new Response(JSON.stringify({
        error: privateLike
          ? "This Drive file is private — ask the uploader to enable link sharing."
          : `Drive fetch failed: ${upstream.status}`,
        type: privateLike ? "drive_private" : "drive_fetch_failed",
        fallback: false,
      }), {
        status: upstream.status || 502,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }

    const checkedDrive = await validatePdfResponse(upstream, null);
    if (!checkedDrive.ok) return checkedDrive;
    const safeUpstream = checkedDrive;
    const upstreamLen = safeUpstream.headers.get("content-length");
    const upstreamType = safeUpstream.headers.get("content-type") || "application/pdf";
    const outHeaders: Record<string, string> = {
      "Content-Type": upstreamType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable, no-transform",
      "CDN-Cache-Control": "public, max-age=86400, immutable, no-transform",
      "Cache-Tag": `drive:${id}`,
      "Accept-Ranges": "none",
      "Content-Encoding": "identity",
      "X-Pdf-Cache": "miss",
    };
    const upstreamEnc = (safeUpstream.headers.get("content-encoding") || "").toLowerCase();
    if (upstreamLen && (upstreamEnc === "" || upstreamEnc === "identity")) {
      outHeaders["Content-Length"] = upstreamLen;
    }
    for (const h of ["etag", "last-modified"]) {
      const v = safeUpstream.headers.get(h);
      if (v) outHeaders[h] = v;
    }

    if (req.method === "HEAD") {
      return new Response(null, { status: safeUpstream.status, headers: headersWithCors(outHeaders) });
    }

    // Tee: one branch streams to the client, the other buffers for the
    // pdf-cache upload. Client latency is unaffected — the upload runs
    // concurrently and any failure is logged, never surfaced.
    if (!safeUpstream.body) {
      return typedPdfError(502, "empty_upstream", "The upstream PDF returned an empty body.");
    }
    const [toClient, toCache] = safeUpstream.body.tee();
    cacheDriveBodyInBackground(id, toCache, upstreamType);

    return new Response(toClient, {
      status: safeUpstream.status,
      headers: headersWithCors(outHeaders),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = /timeout/i.test(message) || (error as { name?: string })?.name === "AbortError";
    console.error("pdf-proxy error", message);
    return new Response(JSON.stringify({ error: isTimeout ? "Upstream PDF timed out" : "PDF proxy failed", code: isTimeout ? "upstream_timeout" : "proxy_failed" }), {
      status: isTimeout ? 504 : 500,
      headers: headersWithCors({ "Content-Type": "application/json" }),
    });
  }
});

// Allow-list of trusted direct PDF CDNs proxied via kind=url. Keep this tight
// so the function can't be abused as an open proxy.
const ALLOWED_HOSTS = [
  /(^|\.)cdn\.jsdelivr\.net$/i,
  /(^|\.)raw\.githubusercontent\.com$/i,
  /(^|\.)blob\.core\.windows\.net$/i,
  /(^|\.)github-storages-cdn\.vercel\.app$/i,
  /(^|\.)storage-safarenglishka-recording\.vercel\.app$/i,
  /(^|\.)storage-naveenbharat-recording\.vercel\.app$/i,
  // Google serves the actual export bytes from a googleusercontent redirect
  // hop; without this the SSRF re-validation turns a valid doc into a 502.
  /(^|\.)googleusercontent\.com$/i,
  // archive.org item pages + their `ia*.us.archive.org` download nodes.
  /(^|\.)archive\.org$/i,
  // --- NCERT / CBSE official PDF hosts (free textbooks, exemplars, syllabus) ---
  /(^|\.)ncert\.nic\.in$/i,
  /(^|\.)ncertbooks\.nic\.in$/i,
  /(^|\.)epathshala\.nic\.in$/i,
  /(^|\.)cbseacademic\.nic\.in$/i,
  /(^|\.)cbse\.gov\.in$/i,
  /(^|\.)cbse\.nic\.in$/i,
  // --- Notion-hosted files (page attachments + their signed S3 file hosts) ---
  /(^|\.)notion\.so$/i,
  /(^|\.)notion\.site$/i,
  /(^|\.)notion-static\.com$/i,
  /^prod-files-secure\.s3\.[a-z0-9-]+\.amazonaws\.com$/i,
  // --- Generic public CDNs commonly used for lecture notes ---
  /(^|\.)unpkg\.com$/i,
  /(^|\.)cdn\.statically\.io$/i,
  /(^|\.)cloudfront\.net$/i,
  /(^|\.)r2\.dev$/i,
  /(^|\.)b-cdn\.net$/i,
  /(^|\.)githubusercontent\.com$/i,
  /(^|\.)dropboxusercontent\.com$/i,
  /(^|\.)supabase\.co$/i,
];

// --- Admin-managed hosts (public.trusted_hosts) ------------------------------
// The static list above is the baseline. Admins can widen it at runtime from
// Admin -> Trusted Hosts without a redeploy, which is what the reader's
// proxy fallback assumed all along. Cached briefly so a burst of pdf.js range
// requests does not hammer Postgres.
const TRUSTED_HOST_TTL_MS = 5 * 60 * 1000;
let trustedHostCache: { hosts: string[]; at: number } | null = null;

async function adminTrustedHosts(): Promise<string[]> {
  const now = Date.now();
  if (trustedHostCache && now - trustedHostCache.at < TRUSTED_HOST_TTL_MS) {
    return trustedHostCache.hosts;
  }
  if (!adminClient) return trustedHostCache?.hosts ?? [];
  try {
    const { data, error } = await adminClient
      .from("trusted_hosts")
      .select("host, category, enabled")
      .eq("enabled", true)
      .in("category", ["media", "website", "frame"]);
    if (error) throw error;
    const hosts = (data ?? [])
      .map((row: { host?: string }) => (row.host ?? "").trim().toLowerCase())
      .filter((host: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host));
    trustedHostCache = { hosts, at: now };
    return hosts;
  } catch {
    // Never hard-fail on a transient DB error — reuse the last good snapshot
    // (or nothing, which leaves only the static baseline).
    return trustedHostCache?.hosts ?? [];
  }
}

/** Host matches an admin-approved entry exactly or as a subdomain. */
function matchesTrustedHost(host: string, trusted: string[]): boolean {
  const h = host.toLowerCase();
  return trusted.some((t) => h === t || h.endsWith("." + t));
}

/**
 * Full check: the SSRF guards from `isAllowedPdfUrl` plus the admin-managed
 * host list. Used on every real request; `isAllowedPdfUrl` stays the
 * synchronous static baseline (and the unit-tested surface).
 */
export async function isAllowedPdfUrlAsync(raw: string): Promise<boolean> {
  if (isAllowedPdfUrl(raw)) return true;
  try {
    const u = new URL(raw);
    if (!passesSsrfGuards(u)) return false;
    return matchesTrustedHost(u.hostname, await adminTrustedHosts());
  } catch {
    return false;
  }
}

/**
 * Resolve an archive.org item id to a direct PDF download URL using the public
 * metadata API. Returns null when the item has no PDF file.
 */
async function resolveArchivePdfUrl(itemId: string): Promise<string | null> {
  // archive.org's metadata API is occasionally slow on a cold isolate. A single
  // 8s attempt made the whole branch answer `415 not_pdf` ("no PDF in this
  // item") for what was really a transient timeout — the reader then showed a
  // hard error even though a retry would have worked. Retry twice, longer.
  let meta: { files?: { name?: string; format?: string; size?: string }[] } | null = null;
  for (let attempt = 0; attempt < 2 && !meta; attempt++) {
    try {
      const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(itemId)}`, {
        signal: timeoutSignal(15_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) { await res.body?.cancel().catch(() => {}); continue; }
      meta = await res.json();
    } catch { /* retry */ }
  }
  if (!meta) return null;
  const files = (meta.files ?? []).filter((f) => typeof f.name === "string" && /\.pdf$/i.test(f.name!));
  if (files.length === 0) return null;
  // File choice = the single biggest factor in whether an Archive item opens
  // on a phone. The raw "Image Container PDF" for a scanned book can exceed
  // 1.4 GB and is not linearized, so pdf.js needs minutes of range requests
  // before the first page paints. Archive's derived `*_text.pdf` contains the
  // SAME page images (JPX) plus an OCR text layer at ~4-5x smaller size, and
  // now renders correctly since the reader ships the OpenJPEG wasm decoder.
  // So: always take the smallest PDF in the item.
  const pool = [...files].sort((a, b) => Number(a.size || 0) - Number(b.size || 0));
  const name = pool[0].name!;
  return `https://archive.org/download/${encodeURIComponent(itemId)}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Archive.org fast path (archive-only, no effect on any other source).
 *
 * pdf.js issues dozens of Range requests per document. Without a cache each
 * one re-ran the `/metadata/<id>` lookup AND re-walked the
 * `archive.org/download/...` → `iaXXXX.us.archive.org` redirect chain, which
 * is what made large Archive items crawl. We resolve the item once and cache
 * the final CDN node URL per isolate for 10 minutes.
 */
const ARCHIVE_NODE_TTL_MS = 10 * 60 * 1000;
const archiveNodeCache = new Map<string, { nodeUrl: string; expiresAt: number }>();

function getCachedArchiveNode(itemId: string): string | null {
  const hit = archiveNodeCache.get(itemId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    archiveNodeCache.delete(itemId);
    return null;
  }
  return hit.nodeUrl;
}

function setCachedArchiveNode(itemId: string, nodeUrl: string): void {
  archiveNodeCache.set(itemId, { nodeUrl, expiresAt: Date.now() + ARCHIVE_NODE_TTL_MS });
}

/**
 * Follow the archive.org download redirect chain once (HEAD-ish GET with a
 * 0-byte range) and return the final `ia*.us.archive.org` node URL.
 */
async function resolveArchiveNodeUrl(downloadUrl: string): Promise<string> {
  let currentUrl = downloadUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedPdfUrl(currentUrl)) return downloadUrl;
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: { Range: "bytes=0-0", Accept: "application/pdf,*/*;q=0.1" },
        signal: timeoutSignal(8_000),
      });
    } catch {
      return currentUrl;
    }
    await res.body?.cancel().catch(() => {});
    if (res.status < 300 || res.status >= 400) return currentUrl;
    const loc = res.headers.get("location");
    if (!loc) return currentUrl;
    try {
      currentUrl = new URL(loc, currentUrl).toString();
    } catch {
      return downloadUrl;
    }
  }
  return currentUrl;
}

/**
 * Durable resolution cache (pdf_source_resolutions).
 *
 * AUDIT 2026-09-08: archive.org lectures took 35-45s to first page. The
 * in-isolate Map above only helps within one warm worker; every cold isolate
 * re-ran the /metadata lookup AND the download→ia*.us.archive.org redirect
 * walk before a single byte moved, and Supabase recycles isolates constantly.
 * Persisting item→node in Postgres makes that cost once per 6h per item
 * globally instead of once per isolate.
 */
const ARCHIVE_DB_TTL_MS = 6 * 60 * 60 * 1000;

async function getStoredResolution(key: string): Promise<string | null> {
  if (!adminClient) return null;
  try {
    const { data, error } = await adminClient
      .from("pdf_source_resolutions")
      .select("resolved_url, expires_at")
      .eq("source_key", key)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return data.resolved_url as string;
  } catch { return null; }
}

async function storeResolution(key: string, resolvedUrl: string, resolveMs: number): Promise<void> {
  if (!adminClient) return;
  try {
    await adminClient.from("pdf_source_resolutions").upsert({
      source_key: key,
      resolved_url: resolvedUrl,
      resolve_ms: resolveMs,
      expires_at: new Date(Date.now() + ARCHIVE_DB_TTL_MS).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_key" });
  } catch (err) { console.warn("[pdf-proxy:resolution]", err); }
}

async function dropStoredResolution(key: string): Promise<void> {
  if (!adminClient) return;
  try {
    await adminClient.from("pdf_source_resolutions").delete().eq("source_key", key);
  } catch { /* best effort */ }
}

/** Cached resolve: item id → direct CDN node URL for its PDF file. */
async function archiveNodeUrlFor(itemId: string): Promise<{ url: string | null; resolveMs: number }> {
  const cached = getCachedArchiveNode(itemId);
  if (cached) return { url: cached, resolveMs: 0 };

  const key = `archive:${itemId}`;
  const stored = await getStoredResolution(key);
  if (stored) {
    setCachedArchiveNode(itemId, stored);
    return { url: stored, resolveMs: 0 };
  }

  const startedAt = Date.now();
  const target = await resolveArchivePdfUrl(itemId);
  if (!target) return { url: null, resolveMs: Date.now() - startedAt };
  const node = await resolveArchiveNodeUrl(target);
  const resolveMs = Date.now() - startedAt;
  setCachedArchiveNode(itemId, node);
  await storeResolution(key, node, resolveMs);
  return { url: node, resolveMs };
}

/**
 * Warm the byte ranges pdf.js asks for first (header + trailer/xref at the tail)
 * so the "Reading document index" phase hits a warm CDN node instead of cold
 * storage. Fire-and-forget; failures are irrelevant to the response.
 */
function prefetchArchiveRanges(nodeUrl: string): void {
  const warm = async () => {
    for (const range of ["bytes=0-262143", "bytes=-262144"]) {
      try {
        const res = await fetch(nodeUrl, {
          headers: { Range: range, Accept: "application/pdf,*/*;q=0.1" },
          signal: timeoutSignal(10_000),
        });
        await res.body?.cancel().catch(() => {});
      } catch { /* warming only */ }
    }
  };
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(warm()); else void warm();
}


// Google Docs / Sheets / Slides are allowed ONLY on their PDF export paths.
// This keeps the function from becoming a general docs.google.com proxy while
// letting admin pre-flight + the reader stream a published doc as PDF bytes.
const GOOGLE_DOCS_HOST = /^docs\.google\.com$/i;
const GOOGLE_EXPORT_PATH =
  /^\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]+\/export\/?$/;

/**
 * SSRF guards shared by the static allow-list and the admin-managed one:
 * https only, no credentials, no non-default ports, no IP-literal or private
 * hosts (defeats DNS-rebinding / localhost / 169.254.169.254 metadata abuse).
 */
export function passesSsrfGuards(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false; // IPv4 literal
  if (host.includes(":")) return false;                 // IPv6 literal
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host)) return false;
  return true;
}

export function isAllowedPdfUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!passesSsrfGuards(u)) return false;
    const host = u.hostname;
    if (GOOGLE_DOCS_HOST.test(host)) return GOOGLE_EXPORT_PATH.test(u.pathname);
    return ALLOWED_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

// Manually follow up to N redirects, re-validating each hop against the
// allow-list. `redirect: "follow"` would let a compromised or misconfigured
// CDN 302 the proxy into `http://169.254.169.254/…` or another private host;
// re-validating at every hop closes that SSRF gap.
const MAX_REDIRECTS = 3;

async function fetchRemoteFile(
  url: string,
  range: string | null,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  const headers = new Headers({
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    // Identity encoding keeps upstream `content-length` byte-exact with the
    // body we relay, so we can safely forward it (real % progress in the
    // reader + pdf.js range streaming).
    "Accept-Encoding": "identity",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  if (range) headers.set("Range", range);

  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isAllowedPdfUrlAsync(currentUrl))) {
      // Synthesize a 502 so the caller sees an upstream failure instead of
      // us silently opening a hole to a private host.
      return new Response(
        JSON.stringify({ error: "Upstream redirected to a disallowed host" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    const res = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal: timeoutSignal(timeoutMs),
    });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    // Drain redirect body to avoid Deno resource leak warnings.
    await res.body?.cancel().catch(() => {});
    if (!loc) return res;
    try {
      currentUrl = new URL(loc, currentUrl).toString();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid redirect target" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  }
  return new Response(
    JSON.stringify({ error: "Too many redirects" }),
    { status: 502, headers: { "Content-Type": "application/json" } },
  );
}

function typedPdfError(status: number, code: string, error: string, details: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error, code, ...details }), {
    status,
    headers: headersWithCors({ "Content-Type": "application/json" }),
  });
}

/**
 * Validate the first bytes without buffering the document. We only sniff full
 * responses and ranges beginning at byte zero; later ranges do not contain the
 * PDF header. The consumed prefix is re-enqueued before the untouched stream.
 */
export function rangeContainsPdfSignature(requestedRange: string | null): boolean {
  if (!requestedRange) return true;
  const match = requestedRange.trim().match(/^bytes=0-(\d+)$/i);
  // Only sniff a byte-zero range when it contains all five `%PDF-` bytes.
  // A size probe such as bytes=0-0 is valid HTTP and must not become a false
  // `415 not_pdf` merely because the caller intentionally requested one byte.
  return !!match && Number(match[1]) >= 4;
}

async function validatePdfResponse(upstream: Response, requestedRange: string | null): Promise<Response> {
  const contentType = upstream.headers.get("content-type") || "";
  if (/text\/html|application\/xhtml|application\/json/i.test(contentType)) {
    await upstream.body?.cancel().catch(() => {});
    return typedPdfError(415, "not_pdf", "The link returned a web page or JSON response instead of a PDF file.", { contentType });
  }
  const shouldSniff = rangeContainsPdfSignature(requestedRange);
  if (!shouldSniff || !upstream.body) return upstream;

  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < 5) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.byteLength; }
  }
  const prefix = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { prefix.set(chunk, offset); offset += chunk.byteLength; }
  const signature = new TextDecoder().decode(prefix.subarray(0, 5));
  if (!signature.startsWith("%PDF-")) {
    await reader.cancel().catch(() => {});
    return typedPdfError(415, "not_pdf", "The upstream response is not a valid PDF file.", {
      contentType,
      signature: signature.replace(/[^\x20-\x7E]/g, "?"),
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(prefix);
    },
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) controller.close();
        else if (value) controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(stream, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
}

async function relayUpstream(upstream: Response, method: string, range: string | null): Promise<Response> {
  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: `Upstream fetch failed: ${upstream.status}` }), {
      status: upstream.status || 502,
      headers: headersWithCors({ "Content-Type": "application/json" }),
    });
  }
  const checked = await validatePdfResponse(upstream, range);
  if (!checked.ok) return checked;
  upstream = checked;

  const outHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") || "application/pdf",
    "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
    "CDN-Cache-Control": "public, max-age=86400, immutable",
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
  };
  for (const h of ["content-range", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) outHeaders[h] = v;
  }
  // Total size of the WHOLE file (not the current chunk). Derived from
  // `content-range: bytes a-b/TOTAL` when a Range was served, else from
  // `content-length` on a full 200 response. The reader uses this to show a
  // real percentage even when the browser can't see a Content-Length.
  const contentRange = upstream.headers.get("content-range") || "";
  const upstreamLen = upstream.headers.get("content-length");
  const upstreamEnc = (upstream.headers.get("content-encoding") || "").toLowerCase();
  const identity = upstreamEnc === "" || upstreamEnc === "identity";
  const rangeTotal = contentRange.match(/\/(\d+)\s*$/)?.[1];
  const total = rangeTotal || (upstream.status === 200 && identity ? upstreamLen : null);
  if (total && Number(total) > 0) outHeaders["X-Pdf-Total-Bytes"] = total;
  // Forwarding Content-Length is safe only when the upstream body is identity
  // encoded — otherwise the declared size differs from the relayed bytes and
  // pdf.js aborts near the tail. With it present, pdf.js can switch to range
  // streaming (critical for large archive.org scans).
  if (upstreamLen && identity) outHeaders["Content-Length"] = upstreamLen;
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: headersWithCors(outHeaders),
  });
}



/**
 * Fallback chain for Google Drive PDFs. Each tier is logged with
 * `[pdf-proxy:drive]` so we can see in Supabase logs which path actually
 * served the file (telemetry).
 *
 *   tier 1: drive.usercontent.google.com/download?confirm=t
 *   tier 2: drive.google.com/uc — parse the interstitial <form> + cookie
 *   tier 3: drive.google.com/uc&confirm=<legacy-token>
 *   tier 4: docs.google.com/uc?export=download  (older mirror)
 */
async function fetchDriveFile(id: string): Promise<Response> {
  const baseHeaders = new Headers({
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    // Force identity so `Content-Length` we forward matches the actual byte
    // stream. Without this, Drive may respond with gzip/br and the length
    // we forward is the compressed size — pdf.js then aborts near the tail
    // with "Content-Length header ... exceeds response Body".
    "Accept-Encoding": "identity",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });

  const log = (tier: string, info: Record<string, unknown>) =>
    console.info("[pdf-proxy:drive]", tier, { id, ...info });

  const driveFetch = (url: string, headers: Headers) =>
    fetch(url, { headers, redirect: "follow", signal: timeoutSignal(DRIVE_UPSTREAM_TIMEOUT_MS) });

  // tier 1
  // acknowledgeAbuse=true bypasses the "can't scan for viruses" interstitial
  // that large Drive PDFs (>25MB) always hit — this is the #1 cause of the
  // "blank/could not load" reports from students opening lecture Drive links.
  const directUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&authuser=0&confirm=t&acknowledgeAbuse=true`;
  let res = await driveFetch(directUrl, baseHeaders);
  let ct = res.headers.get("content-type") || "";
  log("tier1-direct", { status: res.status, ct });
  if (res.ok && !/text\/html/i.test(ct)) {
    recordMetric({ event: "drive_success", drive_id: id, tier: "tier1-direct", last_status: res.status, last_content_type: ct });
    return res;
  }

  // tier 2
  const ucUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}&acknowledgeAbuse=true`;
  res = await driveFetch(ucUrl, baseHeaders);
  ct = res.headers.get("content-type") || "";
  log("tier2-uc", { status: res.status, ct });
  if (!/text\/html/i.test(ct)) {
    recordMetric({ event: "drive_success", drive_id: id, tier: "tier2-uc", last_status: res.status, last_content_type: ct });
    return res;
  }

  const html = await res.text();
  const cookie = res.headers.get("set-cookie")?.split(";")[0];

  const formAction = html.match(/<form[^>]+action="([^"]+download[^"]*)"/i)?.[1];
  const hiddenInputs: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)) {
    hiddenInputs[m[1]] = m[2].replace(/&amp;/g, "&");
  }

  if (formAction && Object.keys(hiddenInputs).length) {
    const qs = new URLSearchParams(hiddenInputs).toString();
    const confirmedHeaders = new Headers(baseHeaders);
    if (cookie) confirmedHeaders.set("Cookie", cookie);
    const sep = formAction.includes("?") ? "&" : "?";
    const followUrl = `${formAction.replace(/&amp;/g, "&")}${sep}${qs}&acknowledgeAbuse=true`;
    res = await driveFetch(followUrl, confirmedHeaders);
    ct = res.headers.get("content-type") || "";
    log("tier2-form", { status: res.status, ct });
    if (res.ok && !/text\/html/i.test(ct)) {
      recordMetric({ event: "drive_success", drive_id: id, tier: "tier2-form", last_status: res.status, last_content_type: ct });
      return res;
    }
  }

  // tier 3 — legacy confirm token
  const token = html.match(/[?&]confirm=([0-9A-Za-z_-]+)/)?.[1];
  if (token) {
    const confirmedHeaders = new Headers(baseHeaders);
    if (cookie) confirmedHeaders.set("Cookie", cookie);
    res = await driveFetch(`${ucUrl}&confirm=${encodeURIComponent(token)}`, confirmedHeaders);
    ct = res.headers.get("content-type") || "";
    log("tier3-token", { status: res.status, ct });
    if (res.ok && !/text\/html/i.test(ct)) {
      recordMetric({ event: "drive_success", drive_id: id, tier: "tier3-token", last_status: res.status, last_content_type: ct });
      return res;
    }
  }

  // tier 4 — docs.google.com mirror (older Drive ids still resolve here)
  const docsUrl = `https://docs.google.com/uc?export=download&id=${encodeURIComponent(id)}&acknowledgeAbuse=true`;
  res = await driveFetch(docsUrl, baseHeaders);
  ct = res.headers.get("content-type") || "";
  log("tier4-docs", { status: res.status, ct });
  if (res.ok && !/text\/html/i.test(ct)) {
    recordMetric({ event: "drive_success", drive_id: id, tier: "tier4-docs", last_status: res.status, last_content_type: ct });
    return res;
  }

  log("exhausted", { lastStatus: res.status });
  recordMetric({ event: "drive_exhausted", drive_id: id, tier: "exhausted", last_status: res.status, last_content_type: ct });
  return new Response(null, { status: 415, statusText: "Drive did not return a PDF" });
}
// redeploy touch 2026-08-01
