import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";


async function getZoomAccessToken(): Promise<string> {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID")!;
  const clientId = Deno.env.get("ZOOM_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET")!;

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT and get user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin or teacher
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || !["admin", "teacher"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden. Admin or teacher required." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { sessionId, topic, startTime, duration = 60, studentEmail } = body;

    if (!sessionId || !topic) {
      return new Response(JSON.stringify({ error: "sessionId and topic are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership check: only admin, the already-assigned teacher, or an unassigned session
    const { data: sess, error: sessErr } = await supabase
      .from("doubt_sessions")
      .select("teacher_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessErr || !sess) {
      return new Response(JSON.stringify({ error: "Doubt session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = roleData.role === "admin";
    if (!isAdmin && sess.teacher_id && sess.teacher_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden: session assigned to another teacher" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Zoom access token
    const accessToken = await getZoomAccessToken();

    // Create Zoom meeting
    const meetingPayload: Record<string, unknown> = {
      topic,
      type: startTime ? 2 : 1, // 1 = instant, 2 = scheduled
      duration,
      settings: {
        join_before_host: true,
        waiting_room: false,
        mute_upon_entry: false,
        participant_video: true,
        host_video: true,
        auto_recording: "none",
      },
    };

    if (startTime) {
      meetingPayload.start_time = startTime;
      meetingPayload.timezone = "Asia/Kolkata";
    }

    const meetingResponse = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(meetingPayload),
    });

    if (!meetingResponse.ok) {
      const errText = await meetingResponse.text();
      throw new Error(`Zoom meeting creation failed: ${meetingResponse.status} ${errText}`);
    }

    const meeting = await meetingResponse.json();

    // Update the doubt_session row with Zoom details
    const { error: updateError } = await supabase
      .from("doubt_sessions")
      .update({
        zoom_meeting_id: meeting.id?.toString(),
        zoom_join_url: meeting.join_url,
        zoom_password: meeting.password,
        zoom_meeting_number: meeting.id?.toString(),
        status: "scheduled",
        teacher_id: user.id,
        scheduled_at: startTime || new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (updateError) {
      console.error("DB update error:", updateError);
    }

    return new Response(
      JSON.stringify({
        meetingId: meeting.id,
        meetingNumber: meeting.id?.toString(),
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        password: meeting.password,
        topic: meeting.topic,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("create-zoom-meeting error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
