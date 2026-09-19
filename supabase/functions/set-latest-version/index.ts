// CI hook: records the version that was just released so the in-app update
// prompt knows what "latest" is.
//
// Auth: a shared secret in the `x-release-token` header, compared against the
// RELEASE_TOKEN secret with a constant-time check. verify_jwt is off
// platform-wide, so this header IS the security boundary.
//
// It never touches force_update or the minimum supported version — a mandatory
// update stays a deliberate admin decision.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const expected = Deno.env.get("RELEASE_TOKEN");
    if (!expected) return json(503, { error: "RELEASE_TOKEN_NOT_CONFIGURED" });
    const provided = req.headers.get("x-release-token") ?? "";
    if (!timingSafeEqual(provided, expected)) return json(401, { error: "Unauthorized" });

    let body: { version?: unknown; platform?: unknown; notes?: unknown } = {};
    try { body = await req.json(); } catch { /* empty */ }
    const version = typeof body.version === "string" ? body.version.trim().replace(/^v/i, "") : "";
    if (!/^\d+(\.\d+){0,3}$/.test(version)) return json(400, { error: "INVALID_VERSION" });
    const platform = body.platform === "ios" ? "ios" : "android";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    patch[platform === "ios" ? "latest_ios_version" : "latest_android_version"] = version;
    if (notes) patch.update_notes = notes;

    const { error } = await admin.from("app_config").update(patch).eq("id", 1);
    if (error) throw error;

    return json(200, { ok: true, platform, version });
  } catch (e) {
    console.error("[set-latest-version] unexpected error", e);
    return json(500, { error: "INTERNAL_ERROR" });
  }
});
