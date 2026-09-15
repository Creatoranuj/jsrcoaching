// Server-side YouTube transcript fetcher.
//
// Input:  { youtubeId: string, lessonId?: string, prefer?: string[] }
// Output: { ok: true, transcript, lang, status: "ok" }
//       | { ok: false, status: "none" | "error", reason }
//
// Strategy:
//   1. Try known caption tracks via public timedtext endpoints
//      (lang=hi → lang=en → lang=hi-Latn → auto-generated).
//   2. Discover any other tracks by scraping the `captionTracks` JSON from
//      the video's watch page HTML.
//   3. Cache the outcome on `lessons.auto_transcript*` when `lessonId` given.
//
// No third-party dep. 5s total budget. Idempotent + safe to re-run.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const TIMEOUT_MS = 5000;
const MAX_CHARS = 12000;
const UA =
  "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function xmlToText(xml: string): string {
  // Both legacy transcript XML (<text>) and TTML (<p>) formats.
  const parts: string[] = [];
  const re = /<(?:text|p)[^>]*>([\s\S]*?)<\/(?:text|p)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const chunk = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (chunk) parts.push(decodeEntities(chunk));
  }
  return parts.join(" ").slice(0, MAX_CHARS);
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "hi,en;q=0.9" },
    });
  } finally {
    clearTimeout(t);
  }
}

async function tryTrack(url: string): Promise<string> {
  try {
    const r = await fetchWithTimeout(url, 2500);
    if (!r.ok) return "";
    const body = await r.text();
    if (!body || body.length < 40) return "";
    return xmlToText(body);
  } catch {
    return "";
  }
}

async function discoverTracks(youtubeId: string): Promise<Array<{ url: string; lang: string }>> {
  try {
    const r = await fetchWithTimeout(
      `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}&hl=hi`,
      3000,
    );
    if (!r.ok) return [];
    const html = await r.text();
    // captionTracks":[{"baseUrl":"...","languageCode":"hi", ...}, ...]
    const m = html.match(/"captionTracks":(\[[\s\S]*?\])/);
    if (!m) return [];
    const tracks = JSON.parse(m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
    if (!Array.isArray(tracks)) return [];
    return tracks
      .filter((t: any) => t && typeof t.baseUrl === "string")
      .map((t: any) => ({ url: t.baseUrl as string, lang: (t.languageCode as string) || "unk" }));
  } catch {
    return [];
  }
}

async function resolveTranscript(youtubeId: string): Promise<{ text: string; lang: string }> {
  const direct = [
    { url: `https://www.youtube.com/api/timedtext?lang=hi&v=${youtubeId}`, lang: "hi" },
    { url: `https://www.youtube.com/api/timedtext?lang=en&v=${youtubeId}`, lang: "en" },
    { url: `https://www.youtube.com/api/timedtext?lang=hi-Latn&v=${youtubeId}`, lang: "hi-Latn" },
  ];
  for (const d of direct) {
    const text = await tryTrack(d.url);
    if (text.length >= 100) return { text, lang: d.lang };
  }
  const discovered = await discoverTracks(youtubeId);
  // Prefer hi → en → auto → first available
  const ranked = [...discovered].sort((a, b) => {
    const score = (t: { lang: string }) =>
      t.lang.startsWith("hi") ? 0 : t.lang.startsWith("en") ? 1 : 2;
    return score(a) - score(b);
  });
  for (const t of ranked) {
    const text = await tryTrack(t.url);
    if (text.length >= 100) return { text, lang: t.lang };
  }
  return { text: "", lang: "" };
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require a valid user JWT — this endpoint mutates lesson rows and hits YouTube
  // on the app's behalf, so anonymous callers must not be allowed.
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;


  try {
    const { youtubeId, lessonId } = (await req.json().catch(() => ({}))) as {
      youtubeId?: string;
      lessonId?: string;
    };
    if (!youtubeId || !/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) {
      return new Response(
        JSON.stringify({ ok: false, status: "error", reason: "invalid youtubeId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const outer = new AbortController();
    const globalTimer = setTimeout(() => outer.abort(), TIMEOUT_MS);

    let result: { text: string; lang: string };
    try {
      result = await resolveTranscript(youtubeId);
    } finally {
      clearTimeout(globalTimer);
    }

    const status = result.text ? "ok" : "none";

    // Cache result on the lesson row when we have a lessonId — but only
    // after confirming the caller is admin/teacher, enrolled in that
    // lesson's course, or the course is free. The service-role client
    // bypasses RLS on `lessons`, so without this gate any signed-in user
    // could overwrite any lesson's cached transcript.
    if (lessonId) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data: lesson } = await supabaseAdmin
          .from("lessons")
          .select("id, course_id")
          .eq("id", lessonId)
          .maybeSingle();

        if (!lesson) {
          return new Response(
            JSON.stringify({ ok: false, status: "error", reason: "lesson not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const [roleRes, enrollmentRes, courseRes] = await Promise.all([
          supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", auth.userId)
            .in("role", ["admin", "teacher"])
            .maybeSingle(),
          supabaseAdmin
            .from("enrollments")
            .select("id")
            .eq("user_id", auth.userId)
            .eq("course_id", lesson.course_id)
            .eq("status", "active")
            .maybeSingle(),
          supabaseAdmin
            .from("courses")
            .select("price")
            .eq("id", lesson.course_id)
            .maybeSingle(),
        ]);

        const isStaff       = !!roleRes.data;
        const isEnrolled    = !!enrollmentRes.data;
        const coursePrice   = Number(courseRes.data?.price ?? 0);
        const isFreeCourse  = !coursePrice || coursePrice <= 0;

        if (!(isStaff || isEnrolled || isFreeCourse)) {
          return new Response(
            JSON.stringify({ ok: false, status: "error", reason: "forbidden" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        await supabaseAdmin
          .from("lessons")
          .update({
            auto_transcript: result.text || null,
            auto_transcript_lang: result.lang || null,
            auto_transcript_fetched_at: new Date().toISOString(),
            auto_transcript_status: status,
          })
          .eq("id", lessonId);
      } catch (e) {
        console.error("fetch-youtube-transcript: cache write failed", e);
      }
    }

    return new Response(
      JSON.stringify(
        status === "ok"
          ? { ok: true, status, transcript: result.text, lang: result.lang }
          : { ok: false, status, reason: "no captions available" },
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("fetch-youtube-transcript error", e);
    return new Response(
      JSON.stringify({ ok: false, status: "error", reason: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
