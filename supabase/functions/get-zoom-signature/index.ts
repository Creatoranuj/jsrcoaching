import { requireUser } from "../_shared/auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Generate HMAC-SHA256 signature for Zoom Meeting SDK
async function generateSignature(
  sdkKey: string,
  sdkSecret: string,
  meetingNumber: string,
  role: number
): Promise<string> {
  const iat = Math.round(new Date().getTime() / 1000) - 30;
  const exp = iat + 60 * 60 * 2; // 2 hours

  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const payload = btoa(
    JSON.stringify({
      sdkKey,
      mn: meetingNumber,
      role,
      iat,
      exp,
      tokenExp: exp,
    })
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const message = `${header}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sdkSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${header}.${payload}.${signatureB64}`;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the JWT — a bare Authorization header used to be accepted.
    const auth = await requireUser(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { meetingNumber, role: requestedRole = 0 } = body;

    if (!meetingNumber) {
      return new Response(JSON.stringify({ error: "meetingNumber is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Is the caller a teacher/admin? Staff may host and may join any meeting.
    const { data: staffRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId)
      .in("role", ["admin", "teacher"]);
    const isStaff = !!(staffRoles && staffRoles.length > 0);

    // Force role=0 (attendee) unless the caller is an admin or teacher.
    let effectiveRole = 0;
    if (Number(requestedRole) === 1) {
      if (isStaff) {
        effectiveRole = 1;
      } else {
        return new Response(
          JSON.stringify({ error: "Host role is restricted to teachers and admins" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // PARTICIPANT CHECK: a valid JWT alone previously granted a signature for
    // ANY meeting number. Non-staff callers must be a participant (student or
    // assigned teacher) of a doubt session bound to this meeting number.
    if (!isStaff) {
      const mn = String(meetingNumber);
      const [{ data: byNumber }, { data: byId }] = await Promise.all([
        admin.from("doubt_sessions").select("student_id, teacher_id").eq("zoom_meeting_number", mn),
        admin.from("doubt_sessions").select("student_id, teacher_id").eq("zoom_meeting_id", mn),
      ]);
      const rows = [...(byNumber ?? []), ...(byId ?? [])];
      const isParticipant = rows.some(
        (r) => r.student_id === auth.userId || r.teacher_id === auth.userId,
      );
      if (!isParticipant) {
        return new Response(
          JSON.stringify({ error: "You are not a participant of this session" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }


    const sdkKey = Deno.env.get("ZOOM_SDK_KEY");
    const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET");

    if (!sdkKey || !sdkSecret) {
      return new Response(
        JSON.stringify({ error: "Zoom SDK credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const signature = await generateSignature(sdkKey, sdkSecret, meetingNumber, effectiveRole);

    return new Response(
      JSON.stringify({ signature, sdkKey }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("get-zoom-signature error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
