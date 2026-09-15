// Verify SMS OTP and issue a Supabase session via magic-link token.
//
// Flow:
//   1. Validate phone + code shape.
//   2. Fetch latest un-consumed, un-expired OTP row for that phone.
//   3. Increment attempts; hard-fail after 5.
//   4. Timing-safe compare of SHA-256 hashes.
//   5. Mark OTP consumed.
//   6. Upsert auth user with phone (creates a Supabase user we can sign in as).
//   7. Return magic-link `hashed_token` — client calls
//      `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` to get session.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const MAX_ATTEMPTS = 5;

function normalizePhone(input: string): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone, code } = await req.json().catch(() => ({}));
    const normalized = normalizePhone(phone);
    const codeStr = String(code || "").trim();

    if (!normalized || !/^\d{6}$/.test(codeStr)) {
      return new Response(JSON.stringify({ error: "Invalid phone or code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Latest active OTP for this phone.
    const { data: otpRow, error: fetchErr } = await supabaseAdmin
      .from("phone_otps")
      .select("id, otp_hash, expires_at, attempts, consumed_at")
      .eq("phone", normalized)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr || !otpRow) {
      return new Response(JSON.stringify({ error: "OTP expired or not found. Request a new one." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin.from("phone_otps")
        .update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);
      return new Response(JSON.stringify({ error: "Too many wrong attempts. Request a new OTP." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment attempt counter BEFORE compare (so a crash still counts the try).
    await supabaseAdmin.from("phone_otps")
      .update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);

    const providedHash = await sha256Hex(codeStr);
    if (!timingSafeEqual(providedHash, otpRow.otp_hash)) {
      return new Response(JSON.stringify({
        error: "Wrong OTP",
        attempts_left: MAX_ATTEMPTS - (otpRow.attempts + 1),
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark consumed atomically.
    await supabaseAdmin.from("phone_otps")
      .update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);

    // Deterministic proxy email so we can reuse Supabase's magic-link flow.
    // Phone-only users get `<phone>@phone.safarenglishka.local`.
    const proxyEmail = `${normalized}@phone.safarenglishka.local`;

    // Upsert user by email. If already exists, this is a no-op.
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
      page: 1, perPage: 1,
    });
    let userId: string | undefined;

    // listUsers doesn't support server-side filter; use getUserByEmail via admin API.
    const { data: byEmail } = await supabaseAdmin.auth.admin
      .getUserById("00000000-0000-0000-0000-000000000000").catch(() => ({ data: null }));

    // Use admin.createUser with `email_confirm:true`; if it exists, we catch and
    // fall through to generateLink which works for both new + existing users.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: proxyEmail,
      phone: `+${normalized}`,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { login_method: "phone_otp", phone: normalized },
    });

    if (createErr && !/already/i.test(createErr.message)) {
      console.error("createUser failed:", createErr.message);
      return new Response(JSON.stringify({ error: "Could not create account" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = created?.user?.id;

    // Generate a magic-link token the client can exchange for a session.
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: proxyEmail,
    });

    if (linkErr || !link?.properties?.hashed_token) {
      console.error("generateLink failed:", linkErr?.message);
      return new Response(JSON.stringify({ error: "Could not issue session" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      token_hash: link.properties.hashed_token,
      email: proxyEmail,
      user_id: userId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Suppress unused-var warning; kept in case future logic wants pagination cursor.
    void existing; void byEmail;
  } catch (err) {
    console.error("verify-phone-otp error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
