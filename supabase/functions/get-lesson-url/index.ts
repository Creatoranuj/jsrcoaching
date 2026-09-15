import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: userError } = await supabase.auth.getClaims(token);
    const user = claimsData?.claims
      ? { id: claimsData.claims.sub as string }
      : null;
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const raw = (body as { lesson_id?: unknown; lessonId?: unknown }).lesson_id
      ?? (body as { lessonId?: unknown }).lessonId;
    const lesson_id = typeof raw === "string" ? raw.trim() : "";
    // Lesson IDs are UUIDs.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(lesson_id)) {
      return new Response(JSON.stringify({ error: "Invalid lesson_id", code: "INVALID_INPUT" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lesson, error: lessonError } = await serviceClient
      .from("lessons")
      .select("id, title, video_url, class_pdf_url, is_locked, course_id, lecture_type")
      .eq("id", lesson_id)
      .single();

    if (lessonError) {
      console.error("Lesson query error:", { lesson_id, user_id: user.id, code: lessonError.code, message: lessonError.message });
      if (lessonError.code === "42501") {
        return new Response(JSON.stringify({ error: "Server configuration error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Lesson not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lesson) {
      return new Response(JSON.stringify({ error: "Lesson not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACCESS GATE (fail-closed) ──
    // Priority order:
    //   1. Admin/teacher → always allowed
    //   2. Active enrollment on this course → allowed
    //   3. Course is free (price 0/null) → allowed
    //   4. Otherwise → 403, regardless of `is_locked`.
    //
    // `is_locked` is NO LONGER the gate. Previously a fail-open default
    // (is_locked=false) leaked paid lessons whenever an admin forgot to
    // tick the lock. Access is now derived from course.price + enrollment,
    // so a misconfigured lesson can never leak.
    const [roleRes, enrollmentRes, courseRes] = await Promise.all([
      serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "teacher"])
        .maybeSingle(),
      serviceClient
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", lesson.course_id)
        .eq("status", "active")
        .maybeSingle(),
      serviceClient
        .from("courses")
        .select("price")
        .eq("id", lesson.course_id)
        .maybeSingle(),
    ]);

    const isAdminOrTeacher = !!roleRes.data;
    const isEnrolled       = !!enrollmentRes.data;
    const coursePrice      = Number(courseRes.data?.price ?? 0);
    const isFreeCourse     = !coursePrice || coursePrice <= 0;

    const allowed = isAdminOrTeacher || isEnrolled || isFreeCourse;

    if (!allowed) {
      console.log("get-lesson-url: access denied", {
        user_id: user.id,
        lesson_id: lesson.id,
        course_id: lesson.course_id,
        reason: "no_enrollment_and_paid_course",
      });
      return new Response(
        JSON.stringify({ error: "Purchase required to access this lesson" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const resolved = await resolveUrls(serviceClient, lesson.video_url, lesson.class_pdf_url);
    return new Response(
      JSON.stringify({
        video_url: resolved.video_url,
        class_pdf_url: resolved.class_pdf_url,
        lecture_type: lesson.lecture_type,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err) {
    console.error("get-lesson-url error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Resolve storage:// paths to signed URLs.
 * Format: storage://bucket-name/path/to/file.mp4
 * Regular URLs pass through unchanged.
 */
async function resolveUrls(
  serviceClient: ReturnType<typeof createClient>,
  videoUrl: string | null,
  classPdfUrl: string | null
): Promise<{ video_url: string | null; class_pdf_url: string | null }> {
  return {
    video_url: videoUrl ? await resolveStoragePath(serviceClient, videoUrl) : null,
    class_pdf_url: classPdfUrl ? await resolveStoragePath(serviceClient, classPdfUrl) : null,
  };
}

async function resolveStoragePath(
  serviceClient: ReturnType<typeof createClient>,
  url: string
): Promise<string> {
  if (!url.startsWith("storage://")) {
    return url;
  }

  // storage://course-videos/lessons/abc.mp4
  const withoutPrefix = url.slice("storage://".length); // "course-videos/lessons/abc.mp4"
  const slashIdx = withoutPrefix.indexOf("/");
  if (slashIdx === -1) {
    console.error("Invalid storage path (no file path):", url);
    return url;
  }

  const bucket = withoutPrefix.slice(0, slashIdx);
  const filePath = withoutPrefix.slice(slashIdx + 1);

  const { data, error } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(filePath, 3600); // 1 hour expiry

  if (error) {
    console.error("Failed to create signed URL:", { bucket, filePath, error: error.message });
    return url; // Return raw path as fallback
  }

  return data.signedUrl;
}

// redeploy touch 2026-08-01
