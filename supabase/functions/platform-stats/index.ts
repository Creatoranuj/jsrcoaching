// Public platform stats — anon-callable. Replaces the previous
// SECURITY DEFINER `get_platform_stats` RPC (anon EXECUTE revoked so
// Supabase linter 0028 is satisfied). Uses service_role only for the
// three aggregate counts; returns no PII.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

Deno.serve(async (req) => {
  const corsHeaders = {
    ...buildCorsHeaders(req),
    "Cache-Control": "public, max-age=3600",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // IP-based rate limit — prevents anon DoS on aggregate COUNT queries.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("cf-connecting-ip") ??
      "unknown";
    const { data: allowed } = await admin.rpc("check_rate_limit_text", {
      _bucket: "platform-stats",
      _identifier: ip,
      _max: RATE_LIMIT_MAX,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (allowed === false) {
      return new Response(
        JSON.stringify({ error: "Too many requests" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [studentsRes, coursesRes, teachersRes] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("courses").select("id", { count: "exact", head: true }),
      admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "teacher"),
    ]);

    return new Response(
      JSON.stringify({
        total_students: studentsRes.count ?? 0,
        total_courses: coursesRes.count ?? 0,
        total_teachers: teachersRes.count ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("platform-stats error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
